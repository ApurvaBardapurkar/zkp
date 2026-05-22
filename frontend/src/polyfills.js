/**
 * Browser polyfills for Node APIs used by snarkjs / circomlibjs / readable-stream.
 * Must load before any ZK or crypto imports.
 */
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
