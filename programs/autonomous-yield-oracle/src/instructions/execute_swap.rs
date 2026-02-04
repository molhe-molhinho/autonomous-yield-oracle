//! Execute Swap instruction
//!
//! Executes a swap via Raydium CPMM or Jupiter aggregator.

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
    /// Token program
    pub token_program: &'a AccountView,
    // Additional accounts for Raydium/Jupiter CPI will be added here
}

impl<'a> TryFrom<&'a [AccountView]> for ExecuteSwapAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a [AccountView]) -> Result<Self, Self::Error> {
        let [oracle, authority, source_token, dest_token, token_program, ..] = accounts else {
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
            token_program,
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
        let oracle_data = self.accounts.oracle.try_borrow()?;
        let state = OracleState::from_bytes(&oracle_data)?;

        // Verify initialized
        if state.is_initialized == 0 {
            return Err(OracleError::NotInitialized.into());
        }

        // Verify authority
        if state.authority != *self.accounts.authority.address().as_ref() {
            return Err(OracleError::InvalidAuthority.into());
        }

        // TODO: Implement actual swap logic
        // Based on self.data.protocol:
        // - 0: Use pinocchio-raydium-cpmm-cpi for direct Raydium swap
        // - 1: Use manual Jupiter CPI via IDL
        
        match self.data.protocol {
            0 => self.execute_raydium_swap(),
            1 => self.execute_jupiter_swap(),
            _ => Err(OracleError::InvalidProtocol.into()),
        }
    }

    fn execute_raydium_swap(&self) -> ProgramResult {
        // TODO: Integrate pinocchio-raydium-cpmm-cpi
        // SwapBaseInput {
        //     payer, authority, pool_state,
        //     input_token_account, output_token_account,
        //     amount_in: self.data.amount_in,
        //     minimum_amount_out: self.data.min_amount_out,
        // }.invoke()?;
        Ok(())
    }

    fn execute_jupiter_swap(&self) -> ProgramResult {
        // TODO: Implement manual Jupiter CPI using jup_idl.json
        // Build instruction with discriminator [229,23,203,151,122,227,173,42]
        // route_plan, in_amount, quoted_out_amount, slippage_bps
        Ok(())
    }
}
