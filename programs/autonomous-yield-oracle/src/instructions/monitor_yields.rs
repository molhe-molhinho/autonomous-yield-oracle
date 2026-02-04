//! Monitor Yields instruction
//!
//! Updates the oracle with current yield data from protocols.
//! The AI agent monitors yields off-chain and submits updates on-chain
//! for transparent, auditable decision tracking.

use pinocchio::{AccountView, ProgramResult};
use solana_program_error::ProgramError;

use crate::state::OracleState;
use crate::error::OracleError;

/// Protocol identifiers
pub mod protocol {
    pub const RAYDIUM_CPMM: u8 = 0;
    pub const JUPITER_ROUTE: u8 = 1;
    pub const KAMINO: u8 = 2;
    pub const MARINADE: u8 = 3;
    pub const JITO: u8 = 4;
}

/// Accounts required for monitoring yields
pub struct MonitorYieldsAccounts<'a> {
    /// The oracle account to update
    pub oracle: &'a AccountView,
    /// The authority (AI agent's wallet)
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
/// Layout: protocol (1) + apy_bps (2) + risk_score (1) + timestamp (8) = 12 bytes
pub struct MonitorYieldsData {
    /// Protocol ID (see protocol module)
    pub protocol: u8,
    /// APY in basis points (e.g., 1500 = 15.00%)
    pub apy_bps: u16,
    /// Risk score (0-100, lower is safer)
    pub risk_score: u8,
    /// Unix timestamp of this observation
    pub timestamp: i64,
}

impl TryFrom<&[u8]> for MonitorYieldsData {
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
            apy_bps: u16::from_le_bytes([data[1], data[2]]),
            risk_score,
            timestamp: i64::from_le_bytes(data[4..12].try_into().unwrap()),
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

        // Calculate risk-adjusted yield
        // Higher risk = lower adjusted yield
        // Formula: adjusted_apy = apy * (100 - risk_score) / 100
        let risk_multiplier = 100u32.saturating_sub(self.data.risk_score as u32);
        let new_adjusted_apy = (self.data.apy_bps as u32 * risk_multiplier) / 100;
        
        let current_risk_multiplier = 100u32.saturating_sub(state.risk_score as u32);
        let current_adjusted_apy = (state.current_apy_bps() as u32 * current_risk_multiplier) / 100;

        // Update if this opportunity has better risk-adjusted yield
        // OR if current data is stale (>1 hour old)
        let is_stale = self.data.timestamp.saturating_sub(state.last_update()) > 3600;
        let is_better = new_adjusted_apy > current_adjusted_apy;

        if is_better || is_stale {
            state.best_protocol = self.data.protocol;
            state.set_current_apy_bps(self.data.apy_bps);
            state.risk_score = self.data.risk_score;
            state.set_last_update(self.data.timestamp);
            state.increment_decisions();
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_risk_adjusted_yield() {
        // 15% APY with 20 risk score
        // adjusted = 1500 * (100 - 20) / 100 = 1500 * 80 / 100 = 1200
        let apy: u32 = 1500;
        let risk: u32 = 20;
        let adjusted = (apy * (100 - risk)) / 100;
        assert_eq!(adjusted, 1200);
    }
}
