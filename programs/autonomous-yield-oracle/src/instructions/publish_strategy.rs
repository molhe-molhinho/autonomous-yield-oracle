//! Publish Strategy instruction
//!
//! Publishes current strategy recommendation to oracle state.

use pinocchio::{AccountView, ProgramResult};
use solana_program_error::ProgramError;

use crate::state::OracleState;
use crate::error::OracleError;

/// Accounts required for publishing strategy
pub struct PublishStrategyAccounts<'a> {
    /// The oracle account
    pub oracle: &'a AccountView,
    /// The authority
    pub authority: &'a AccountView,
}

impl<'a> TryFrom<&'a [AccountView]> for PublishStrategyAccounts<'a> {
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

/// Instruction data for strategy publishing
pub struct PublishStrategyData {
    /// Recommended protocol
    pub protocol: u8,
    /// Expected APY (basis points)
    pub expected_apy_bps: u16,
    /// Risk assessment (0-100)
    pub risk_score: u8,
    /// Timestamp of analysis
    pub timestamp: i64,
}

impl TryFrom<&[u8]> for PublishStrategyData {
    type Error = ProgramError;

    fn try_from(data: &[u8]) -> Result<Self, Self::Error> {
        if data.len() < 12 {
            return Err(ProgramError::InvalidInstructionData);
        }

        let risk_score = data[3];
        if risk_score > 100 {
            return Err(OracleError::InvalidRiskScore.into());
        }

        Ok(Self {
            protocol: data[0],
            expected_apy_bps: u16::from_le_bytes([data[1], data[2]]),
            risk_score,
            timestamp: i64::from_le_bytes(data[4..12].try_into().unwrap()),
        })
    }
}

/// Publish Strategy instruction
pub struct PublishStrategy<'a> {
    pub accounts: PublishStrategyAccounts<'a>,
    pub data: PublishStrategyData,
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for PublishStrategy<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        let accounts = PublishStrategyAccounts::try_from(accounts)?;
        let data = PublishStrategyData::try_from(data)?;
        Ok(Self { accounts, data })
    }
}

impl<'a> PublishStrategy<'a> {
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

        // Update oracle with strategy data
        state.best_protocol = self.data.protocol;
        state.set_current_apy_bps(self.data.expected_apy_bps);
        state.risk_score = self.data.risk_score;
        state.set_last_update(self.data.timestamp);
        state.increment_decisions();

        Ok(())
    }
}
