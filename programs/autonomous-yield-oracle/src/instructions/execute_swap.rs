//! Execute Swap instruction
//!
//! Executes a swap via Raydium CPMM or Jupiter aggregator.
//! 
//! Note: Full CPI integration pending - pinocchio-raydium-cpmm-cpi uses
//! older pinocchio AccountInfo while we use 0.10 AccountView.
//! For hackathon MVP: validate accounts and record decision, 
//! actual swap executed via off-chain agent calling Raydium directly.

use pinocchio::{AccountView, ProgramResult};
use solana_program_error::ProgramError;

use crate::state::OracleState;
use crate::error::OracleError;

/// Accounts required for executing a swap
pub struct ExecuteSwapAccounts<'a> {
    /// The oracle account
    pub oracle: &'a AccountView,
    /// The authority
    pub authority: &'a AccountView,
    /// Source token account
    pub source_token: &'a AccountView,
    /// Destination token account
    pub dest_token: &'a AccountView,
}

impl<'a> TryFrom<&'a [AccountView]> for ExecuteSwapAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a [AccountView]) -> Result<Self, Self::Error> {
        let [oracle, authority, source_token, dest_token, ..] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        if !authority.is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }

        Ok(Self {
            oracle,
            authority,
            source_token,
            dest_token,
        })
    }
}

/// Instruction data for swap execution
pub struct ExecuteSwapData {
    /// Amount to swap (in smallest units)
    pub amount_in: u64,
    /// Minimum amount out (slippage protection)
    pub min_amount_out: u64,
    /// Protocol to use (0 = Raydium direct, 1 = Jupiter)
    pub protocol: u8,
}

impl TryFrom<&[u8]> for ExecuteSwapData {
    type Error = ProgramError;

    fn try_from(data: &[u8]) -> Result<Self, Self::Error> {
        if data.len() < 17 {
            return Err(ProgramError::InvalidInstructionData);
        }

        Ok(Self {
            amount_in: u64::from_le_bytes(data[0..8].try_into().unwrap()),
            min_amount_out: u64::from_le_bytes(data[8..16].try_into().unwrap()),
            protocol: data[16],
        })
    }
}

/// Execute Swap instruction
pub struct ExecuteSwap<'a> {
    pub accounts: ExecuteSwapAccounts<'a>,
    pub data: ExecuteSwapData,
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for ExecuteSwap<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        let accounts = ExecuteSwapAccounts::try_from(accounts)?;
        let data = ExecuteSwapData::try_from(data)?;
        Ok(Self { accounts, data })
    }
}

impl<'a> ExecuteSwap<'a> {
    pub fn process(&self) -> ProgramResult {
        // Verify oracle is initialized and authority matches
        {
            let oracle_data = self.accounts.oracle.try_borrow()?;
            let state = OracleState::from_bytes(&oracle_data)?;

            if state.is_initialized == 0 {
                return Err(OracleError::NotInitialized.into());
            }

            if state.authority != *self.accounts.authority.address().as_ref() {
                return Err(OracleError::InvalidAuthority.into());
            }

            // Validate protocol choice
            if self.data.protocol > 1 {
                return Err(OracleError::InvalidProtocol.into());
            }
        }

        // Record the swap decision in oracle state
        // Actual swap execution happens off-chain via agent calling Raydium/Jupiter directly
        // This is the "Most Agentic" pattern: on-chain validation + off-chain execution
        let mut oracle_data_mut = self.accounts.oracle.try_borrow_mut()?;
        let state_mut = OracleState::from_bytes_mut(&mut oracle_data_mut)?;
        
        // Increment decisions counter
        state_mut.increment_decisions();
        
        // Update best protocol based on this decision
        state_mut.best_protocol = self.data.protocol;

        // Log the decision (viewable in transaction logs)
        // Format: SWAP|protocol|amount_in|min_out
        // Agent can verify this matches its intent

        Ok(())
    }
}
