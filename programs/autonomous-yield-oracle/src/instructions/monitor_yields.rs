//! Monitor Yields instruction
//!
//! Updates the oracle with current yield data from protocols.

use pinocchio::{AccountView, ProgramResult};
use solana_program_error::ProgramError;

use crate::state::OracleState;
use crate::error::OracleError;

/// Accounts required for monitoring yields
pub struct MonitorYieldsAccounts<'a> {
    /// The oracle account to update
    pub oracle: &'a AccountView,
    /// The authority
    pub authority: &'a AccountView,
}

impl<'a> TryFrom<&'a [AccountView]> for MonitorYieldsAccounts<'a> {
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

/// Instruction data for monitor yields
pub struct MonitorYieldsData {
    /// Protocol ID (0 = Raydium, 1 = Jupiter, etc.)
    pub protocol: u8,
    /// APY in basis points
    pub apy_bps: u16,
    /// Risk score (0-100)
    pub risk_score: u8,
}

impl TryFrom<&[u8]> for MonitorYieldsData {
    type Error = ProgramError;

    fn try_from(data: &[u8]) -> Result<Self, Self::Error> {
        if data.len() < 4 {
            return Err(ProgramError::InvalidInstructionData);
        }

        let risk_score = data[3];
        if risk_score > 100 {
            return Err(OracleError::InvalidRiskScore.into());
        }

        Ok(Self {
            protocol: data[0],
            apy_bps: u16::from_le_bytes([data[1], data[2]]),
            risk_score,
        })
    }
}

/// Monitor Yields instruction
pub struct MonitorYields<'a> {
    pub accounts: MonitorYieldsAccounts<'a>,
    pub data: MonitorYieldsData,
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for MonitorYields<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        let accounts = MonitorYieldsAccounts::try_from(accounts)?;
        let data = MonitorYieldsData::try_from(data)?;
        Ok(Self { accounts, data })
    }
}

impl<'a> MonitorYields<'a> {
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

        // Update yield data if better opportunity found
        if self.data.apy_bps > state.current_apy_bps() {
            state.best_protocol = self.data.protocol;
            state.set_current_apy_bps(self.data.apy_bps);
            state.risk_score = self.data.risk_score;
            state.increment_decisions();
        }

        Ok(())
    }
}
