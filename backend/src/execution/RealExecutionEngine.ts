/**
 * RealExecutionEngine — DISABLED stub for future real trading.
 * Must never place orders in this paper trading lab.
 */
export class RealExecutionEngine {
  static readonly ENABLED = false;

  async placeOrder(): Promise<never> {
    throw new Error(
      'RealExecutionEngine is DISABLED. This lab only supports paper trading. REAL_EXECUTION_ENABLED is hard-coded false.',
    );
  }

  async cancelOrder(): Promise<never> {
    throw new Error('RealExecutionEngine is DISABLED.');
  }
}
