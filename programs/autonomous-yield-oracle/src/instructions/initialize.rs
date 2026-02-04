//! Initialize instruction
//!
//! Sets up the oracle with an authority.

use pinocchio::{AccountView, ProgramResult};
use solana_program_error::ProgramError;

use crate::state::OracleState;

/// Accounts required for initialization
pub struct InitializeAccounts<'a> {
    /// The oracle account to initialize
    pub oracle: &'a AccountView,
    /// The authority that will control the oracle
    pub authority: &'a AccountView,
    /// System program
    pub system_program: &'a AccountView,
}

impl<'a> TryFrom<&'a [AccountView]> for InitializeAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a [AccountView]) -> Result<Self, Self::Error> {
        let [oracle, authority, system_program, ..] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        // Authority must sign
        if !authority.is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }

        Ok(Self {
            oracle,
            authority,
            system_program,
        })
    }
}

/// Initialize instruction
pub struct Initialize<'a> {
    pub accounts: InitializeAccounts<'a>,
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for Initialize<'a> {
    type Error = ProgramError;

    fn try_from((_data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        let accounts = InitializeAccounts::try_from(accounts)?;
        Ok(Self { accounts })
    }
}

impl<'a> Initialize<'a> {
    pub fn process(&self) -> ProgramResult {
        let mut data = self.accounts.oracle.try_borrow_mut()?;
        let state = OracleState::from_bytes_mut(&mut data)?;

        // Check not already initialized
        if state.is_initialized != 0 {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        // Initialize state
        state.is_initialized = 1;
        state.authority.copy_from_slice(self.accounts.authority.address().as_ref());
        state.best_protocol = 0;
        state.set_current_apy_bps(0);
        state.risk_score = 50; // Default medium risk
        state.set_last_update(0);
        state.set_total_value_managed(0);

        Ok(())
    }
}
