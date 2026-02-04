//! Autonomous Yield Oracle
//! 
//! A 24/7 autonomous yield optimization engine for Solana DeFi.
//! Built with pure Pinocchio for maximum efficiency.
//!
//! Created by Turbinete 🚀 for the Colosseum Agent Hackathon 2026.

use pinocchio::{
    account::AccountView,
    address::Address,
    entrypoint,
    error::ProgramError,
    ProgramResult,
};

// Declare the program entrypoint
entrypoint!(process_instruction);

/// Program ID - will be set after deployment
pub const ID: Address = Address::new_from_array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/// Oracle state storing current yield data and strategy recommendations
#[repr(C)]
pub struct OracleState {
    /// Is this oracle initialized?
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
    pub const LEN: usize = 1 + 32 + 1 + 2 + 1 + 8 + 8 + 8 + 8; // 69 bytes

    pub fn from_bytes(data: &[u8]) -> Result<&Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(unsafe { &*(data.as_ptr() as *const Self) })
    }

    pub fn from_bytes_mut(data: &mut [u8]) -> Result<&mut Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(unsafe { &mut *(data.as_mut_ptr() as *mut Self) })
    }

    pub fn current_apy_bps(&self) -> u16 {
        u16::from_le_bytes(self.current_apy_bps)
    }

    pub fn set_current_apy_bps(&mut self, apy: u16) {
        self.current_apy_bps = apy.to_le_bytes();
    }

    pub fn last_update(&self) -> i64 {
        i64::from_le_bytes(self.last_update)
    }

    pub fn set_last_update(&mut self, ts: i64) {
        self.last_update = ts.to_le_bytes();
    }

    pub fn total_value_managed(&self) -> u64 {
        u64::from_le_bytes(self.total_value_managed)
    }

    pub fn set_total_value_managed(&mut self, val: u64) {
        self.total_value_managed = val.to_le_bytes();
    }

    pub fn decisions_count(&self) -> u64 {
        u64::from_le_bytes(self.decisions_count)
    }

    pub fn increment_decisions(&mut self) {
        let count = self.decisions_count().saturating_add(1);
        self.decisions_count = count.to_le_bytes();
    }

    pub fn cumulative_pnl(&self) -> i64 {
        i64::from_le_bytes(self.cumulative_pnl)
    }

    pub fn add_pnl(&mut self, pnl: i64) {
        let current = self.cumulative_pnl();
        let new_pnl = current.saturating_add(pnl);
        self.cumulative_pnl = new_pnl.to_le_bytes();
    }
}

/// Main instruction processor
fn process_instruction(
    _program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    match instruction_data.split_first() {
        Some((&0, data)) => Initialize::try_from((data, accounts))?.process(),
        Some((&1, data)) => MonitorYields::try_from((data, accounts))?.process(),
        Some((&2, data)) => ExecuteSwap::try_from((data, accounts))?.process(),
        Some((&3, data)) => Rebalance::try_from((data, accounts))?.process(),
        Some((&4, data)) => PublishStrategy::try_from((data, accounts))?.process(),
        Some((&5, data)) => EmergencyWithdraw::try_from((data, accounts))?.process(),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

// ============================================================================
// INSTRUCTION: Initialize
// ============================================================================

pub struct InitializeAccounts<'a> {
    pub oracle: &'a AccountView,
    pub authority: &'a AccountView,
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

        Ok(Self { oracle, authority, system_program })
    }
}

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
        let mut data = self.accounts.oracle.try_borrow_mut_data()?;
        let state = OracleState::from_bytes_mut(&mut data)?;
        
        // Check not already initialized
        if state.is_initialized != 0 {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

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

// ============================================================================
// INSTRUCTION: MonitorYields
// ============================================================================

pub struct MonitorYieldsAccounts<'a> {
    pub oracle: &'a AccountView,
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

pub struct MonitorYieldsData {
    pub protocol: u8,
    pub apy_bps: u16,
    pub risk_score: u8,
}

impl TryFrom<&[u8]> for MonitorYieldsData {
    type Error = ProgramError;

    fn try_from(data: &[u8]) -> Result<Self, Self::Error> {
        if data.len() < 4 {
            return Err(ProgramError::InvalidInstructionData);
        }

        Ok(Self {
            protocol: data[0],
            apy_bps: u16::from_le_bytes([data[1], data[2]]),
            risk_score: data[3],
        })
    }
}

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
        let mut oracle_data = self.accounts.oracle.try_borrow_mut_data()?;
        let state = OracleState::from_bytes_mut(&mut oracle_data)?;

        // Verify authority
        if state.authority != *self.accounts.authority.address().as_ref() {
            return Err(ProgramError::InvalidAccountOwner);
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

// ============================================================================
// INSTRUCTION: ExecuteSwap (Placeholder - will integrate Raydium CPMM CPI)
// ============================================================================

pub struct ExecuteSwap<'a> {
    _accounts: &'a [AccountView],
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for ExecuteSwap<'a> {
    type Error = ProgramError;

    fn try_from((_data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        Ok(Self { _accounts: accounts })
    }
}

impl<'a> ExecuteSwap<'a> {
    pub fn process(&self) -> ProgramResult {
        // TODO: Integrate pinocchio-raydium-cpmm-cpi for direct AMM swaps
        // TODO: Integrate manual Jupiter CPI for complex routes
        Ok(())
    }
}

// ============================================================================
// INSTRUCTION: Rebalance
// ============================================================================

pub struct Rebalance<'a> {
    _accounts: &'a [AccountView],
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for Rebalance<'a> {
    type Error = ProgramError;

    fn try_from((_data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        Ok(Self { _accounts: accounts })
    }
}

impl<'a> Rebalance<'a> {
    pub fn process(&self) -> ProgramResult {
        // TODO: Implement autonomous rebalancing logic
        Ok(())
    }
}

// ============================================================================
// INSTRUCTION: PublishStrategy
// ============================================================================

pub struct PublishStrategy<'a> {
    _accounts: &'a [AccountView],
}

impl<'a> TryFrom<(&'a [u8], &'a [AccountView])> for PublishStrategy<'a> {
    type Error = ProgramError;

    fn try_from((_data, accounts): (&'a [u8], &'a [AccountView])) -> Result<Self, Self::Error> {
        Ok(Self { _accounts: accounts })
    }
}

impl<'a> PublishStrategy<'a> {
    pub fn process(&self) -> ProgramResult {
        // TODO: Publish oracle strategy data
        Ok(())
    }
}

// ============================================================================
// INSTRUCTION: EmergencyWithdraw
// ============================================================================

pub struct EmergencyWithdrawAccounts<'a> {
    pub oracle: &'a AccountView,
    pub authority: &'a AccountView,
    pub destination: &'a AccountView,
}

impl<'a> TryFrom<&'a [AccountView]> for EmergencyWithdrawAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a [AccountView]) -> Result<Self, Self::Error> {
        let [oracle, authority, destination, ..] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        if !authority.is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }

        Ok(Self { oracle, authority, destination })
    }
}

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
        let oracle_data = self.accounts.oracle.try_borrow_data()?;
        let state = OracleState::from_bytes(&oracle_data)?;

        // Verify authority
        if state.authority != *self.accounts.authority.address().as_ref() {
            return Err(ProgramError::InvalidAccountOwner);
        }

        // TODO: Close all positions and return funds
        // This is a safety feature for risk management

        Ok(())
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
