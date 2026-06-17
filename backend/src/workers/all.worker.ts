/**
 * Combined worker entry point — runs all BullMQ workers in a single process.
 *
 * Each worker module starts itself on import (creates its Worker, registers
 * its own listeners and SIGTERM handler), so this file only needs to import
 * them; multiple SIGTERM listeners on the same process is fine, Node/Bun
 * calls all of them. Run as one Render worker service rather than four
 * separate ones — these are lightweight, low-volume queues and don't need
 * independent scaling or failure isolation from each other.
 */
import "./settlement.worker";
import "./escrow.worker";
import "./rail.worker";
import "./notify.worker";

console.log("[Workers] All workers started: settlement, escrow, rail, notify");
