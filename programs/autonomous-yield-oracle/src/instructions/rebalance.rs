//! Rebalance instruction
//!
//! Autonomous rebalancing based on yield optimization.

use pinocchio::{AccountView, ProgramResult};
use solana_program_error::ProgramError;

use crate::state::OracleState;
use crate::error::OracleError;

/// Accounts required for rebalancing
pub struct RebalanceAccounts<'a> {
    /// The oracle account
    pub oracle: &'a AccountView,
    /// The authority
    pub authority: &'a AccountView,
    // Additional accounts for token operations
}

impl<'a> TryFrom<&'a [AccountView]> for RebalanceAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a [AccountView]) -> Result<Self, Self::Error> {
        let [oracle, authority, ..] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        if !authority.is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }

        Ok(Self { oracle, authority })
    }
}

/// Instruction data for rebalancing
pub struct RebalanceData {
    /// Target allocation percentages (basis points, must sum to 10000)
    pub target_allocation_bps: [u16; 4],
    /// Maximum slippage allowed (basis points)
    pub max_slippage_bps: u16,
}

impl TryFrom<&[u8]> for RebalanceData {
    type Error = ProgramError;

    fn try_from(data: &[u8]) -> Result<Self, Self::Error> {
        if data.len() < 10 {
            return Err(ProgramError::InvalidInstructionData);
        }

        let target_allocation_bps = [
            u16::from_le_bytes([data[0], data[1]]),
            u16::from_le_bytes([data[2], data[3]]),
            u16::from_le_bytes([data[4], data[5]]),
            u16::from_le_bytes([data[6], data[7]]),
        ];

        // Verify allocations sum to 10000 (100%)
        let sum: u16 = target_allocation_bps.iter().sum();
        if sum != 10000 {
            return Err(ProgramError::InvalidInstructionData);
        }

        Ok(Self {
            target_allocation_bps,
            max_slippage_bps: u16::from_le_bytes([data[8], data[9]]),
        })
    }
}

/// Rebalance instruction
pub struct Rebalance<'a> {
    pub accounts: RebalanceAccounts<'a>,
    pub data: RebalanceData,
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for Rebalance<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        let accounts = RebalanceAccounts::try_from(accounts)?;
        let data = RebalanceData::try_from(data)?;
        Ok(Self { accounts, data })
    }
}

impl<'a> Rebalance<'a> {
    pub fn process(&self) -> ProgramResult {
        let mut oracle_data = self.accounts.oracle.try_borrow_mut()?;
        let state = OracleState::from_bytes_mut(&mut oracle_data)?;

        // Verify initialized
        if state.is_initialized == 0 {
            return Err(OracleError::NotInitialized.into());
        }

        // Verify authority
        if state.authority != *self.accounts.authority.address().as_ref() {
            return Err(OracleError::InvalidAuthority.into());
        }

        // TODO: Implement autonomous rebalancing logic
        // 1. Get current positions across protocols
        // 2. Calculate required swaps to reach target allocation
        // 3. Execute swaps via Raydium/Jupiter
        // 4. Update oracle state with new positions
        // 5. Track PnL

        state.increment_decisions();

        Ok(())
    }
}
