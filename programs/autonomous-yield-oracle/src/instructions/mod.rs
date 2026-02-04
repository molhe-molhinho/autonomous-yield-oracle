//! Instructions module
//!
//! Contains all instruction handlers for the Autonomous Yield Oracle.

mod initialize;
mod monitor_yields;
mod execute_swap;
mod rebalance;
mod publish_strategy;
mod emergency_withdraw;

pub use initialize::*;
pub use monitor_yields::*;
pub use execute_swap::*;
pub use rebalance::*;
pub use publish_strategy::*;
pub use emergency_withdraw::*;

/// Instruction discriminators
pub mod discriminator {
    pub const INITIALIZE: u8 = 0;
    pub const MONITOR_YIELDS: u8 = 1;
    pub const EXECUTE_SWAP: u8 = 2;
    pub const REBALANCE: u8 = 3;
    pub const PUBLISH_STRATEGY: u8 = 4;
    pub const EMERGENCY_WITHDRAW: u8 = 5;
}
