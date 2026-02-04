//! Emergency Withdraw instruction
//!
//! Safety feature for risk management - withdraws all funds to authority.

use pinocchio::{AccountView, ProgramResult};
use solana_program_error::ProgramError;

use crate::state::OracleState;
use crate::error::OracleError;

/// Accounts required for emergency withdrawal
pub struct EmergencyWithdrawAccounts<'a> {
    /// The oracle account
    pub oracle: &'a AccountView,
    /// The authority (must sign)
    pub authority: &'a AccountView,
    /// Destination for withdrawn funds
    pub destination: &'a AccountView,
    // Additional token accounts as needed
}

impl<'a> TryFrom<&'a [AccountView]> for EmergencyWithdrawAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a [AccountView]) -> Result<Self, Self::Error> {
        let [oracle, authority, destination, ..] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        // Authority MUST sign for emergency operations
        if !authority.is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }

        Ok(Self {
            oracle,
            authority,
            destination,
        })
    }
}

/// Emergency Withdraw instruction
pub struct EmergencyWithdraw<'a> {
    pub accounts: EmergencyWithdrawAccounts<'a>,
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for EmergencyWithdraw<'a> {
    type Error = ProgramError;

    fn try_from((_data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        let accounts = EmergencyWithdrawAccounts::try_from(accounts)?;
        Ok(Self { accounts })
    }
}

impl<'a> EmergencyWithdraw<'a> {
    pub fn process(&self) -> ProgramResult {
        let oracle_data = self.accounts.oracle.try_borrow()?;
        let state = OracleState::from_bytes(&oracle_data)?;

        // Verify initialized
        if state.is_initialized == 0 {
            return Err(OracleError::NotInitialized.into());
        }

        // Verify authority - CRITICAL security check
        if state.authority != *self.accounts.authority.address().as_ref() {
            return Err(OracleError::InvalidAuthority.into());
        }

        // TODO: Implement emergency withdrawal
        // 1. Close all open positions
        // 2. Swap all tokens back to SOL or USDC
        // 3. Transfer all funds to destination
        // 4. Update oracle state to reflect emergency mode
        //
        // This is a safety feature - must work even under adverse conditions

        Ok(())
    }
}
