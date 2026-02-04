//! Oracle State
//!
//! Stores yield data, strategy recommendations, and autonomous decision tracking.

use solana_program_error::ProgramError;

/// Oracle state storing current yield data and strategy recommendations
#[repr(C)]
pub struct OracleState {
    /// Is this oracle initialized? (0 = no, 1 = yes)
    pub is_initialized: u8,
    /// Authority that can update the oracle (32 bytes)
    pub authority: [u8; 32],
    /// Current best yield protocol (0 = Raydium, 1 = Jupiter route, etc.)
    pub best_protocol: u8,
    /// Current APY in basis points (e.g., 1500 = 15%)
    current_apy_bps: [u8; 2],
    /// Risk score (0-100, lower is safer)
    pub risk_score: u8,
    /// Timestamp of last update (8 bytes as le)
    last_update: [u8; 8],
    /// Total value managed in lamports (8 bytes as le)
    total_value_managed: [u8; 8],
    /// Number of autonomous decisions made (8 bytes as le)
    decisions_count: [u8; 8],
    /// Cumulative profit/loss in lamports (8 bytes as le, signed)
    cumulative_pnl: [u8; 8],
}

impl OracleState {
    /// Size of the oracle state in bytes
    pub const LEN: usize = 1 + 32 + 1 + 2 + 1 + 8 + 8 + 8 + 8; // 69 bytes

    /// Discriminator for account identification
    pub const DISCRIMINATOR: u8 = 1;

    /// Seeds for PDA derivation
    pub const SEED_PREFIX: &'static [u8] = b"oracle";

    /// Read oracle state from account data
    pub fn from_bytes(data: &[u8]) -> Result<&Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(unsafe { &*(data.as_ptr() as *const Self) })
    }

    /// Get mutable reference to oracle state from account data
    pub fn from_bytes_mut(data: &mut [u8]) -> Result<&mut Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(unsafe { &mut *(data.as_mut_ptr() as *mut Self) })
    }

    // ========== Getters ==========

    pub fn current_apy_bps(&self) -> u16 {
        u16::from_le_bytes(self.current_apy_bps)
    }

    pub fn last_update(&self) -> i64 {
        i64::from_le_bytes(self.last_update)
    }

    pub fn total_value_managed(&self) -> u64 {
        u64::from_le_bytes(self.total_value_managed)
    }

    pub fn decisions_count(&self) -> u64 {
        u64::from_le_bytes(self.decisions_count)
    }

    pub fn cumulative_pnl(&self) -> i64 {
        i64::from_le_bytes(self.cumulative_pnl)
    }

    // ========== Setters ==========

    pub fn set_current_apy_bps(&mut self, apy: u16) {
        self.current_apy_bps = apy.to_le_bytes();
    }

    pub fn set_last_update(&mut self, ts: i64) {
        self.last_update = ts.to_le_bytes();
    }

    pub fn set_total_value_managed(&mut self, val: u64) {
        self.total_value_managed = val.to_le_bytes();
    }

    pub fn increment_decisions(&mut self) {
        let count = self.decisions_count().saturating_add(1);
        self.decisions_count = count.to_le_bytes();
    }

    pub fn add_pnl(&mut self, pnl: i64) {
        let current = self.cumulative_pnl();
        let new_pnl = current.saturating_add(pnl);
        self.cumulative_pnl = new_pnl.to_le_bytes();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oracle_state_size() {
        assert_eq!(OracleState::LEN, 69);
    }
}
