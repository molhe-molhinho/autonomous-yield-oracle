//! Autonomous Yield Oracle
//!
//! A 24/7 autonomous yield optimization engine for Solana DeFi.
//! Built with pure Pinocchio for maximum efficiency.
//!
//! ## Instructions
//!
//! - `Initialize` (0): Set up the oracle with an authority
//! - `MonitorYields` (1): Update yield data from protocols
//! - `ExecuteSwap` (2): Execute swaps via Raydium/Jupiter
//! - `Rebalance` (3): Autonomous portfolio rebalancing
//! - `PublishStrategy` (4): Publish strategy recommendations
//! - `EmergencyWithdraw` (5): Safety withdrawal to authority
//!
//! Created by Turbinete 🚀 for the Colosseum Agent Hackathon 2026.

use pinocchio::{AccountView, Address, entrypoint, ProgramResult};
use solana_program_error::ProgramError;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

// Declare the program entrypoint
entrypoint!(process_instruction);

/// Program ID - will be updated after deployment
pub const ID: Address = Address::new_from_array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/// Main instruction processor
fn process_instruction(
    _program_id: &Address,
    accounts: &[AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    match instruction_data.split_first() {
        Some((&discriminator::INITIALIZE, data)) => {
            Initialize::try_from((data, accounts))?.process()
        }
        Some((&discriminator::MONITOR_YIELDS, data)) => {
            MonitorYields::try_from((data, accounts))?.process()
        }
        Some((&discriminator::EXECUTE_SWAP, data)) => {
            ExecuteSwap::try_from((data, accounts))?.process()
        }
        Some((&discriminator::REBALANCE, data)) => {
            Rebalance::try_from((data, accounts))?.process()
        }
        Some((&discriminator::PUBLISH_STRATEGY, data)) => {
            PublishStrategy::try_from((data, accounts))?.process()
        }
        Some((&discriminator::EMERGENCY_WITHDRAW, data)) => {
            EmergencyWithdraw::try_from((data, accounts))?.process()
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
