//! Custom program errors

use solana_program_error::ProgramError;

/// Custom errors for the Autonomous Yield Oracle
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleError {
    /// Oracle is already initialized
    AlreadyInitialized,
    /// Oracle is not initialized
    NotInitialized,
    /// Invalid authority
    InvalidAuthority,
    /// Invalid protocol ID
    InvalidProtocol,
    /// Risk score out of range (must be 0-100)
    InvalidRiskScore,
    /// Insufficient funds for operation
    InsufficientFunds,
    /// Slippage tolerance exceeded
    SlippageExceeded,
    /// Emergency mode is active
    EmergencyModeActive,
}

impl From<OracleError> for ProgramError {
    fn from(e: OracleError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
