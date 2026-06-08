function runWasmTelemetry(rawWasmBuffer) {
    console.log("[Telemetry] Initializing Native WebAssembly structure parser...");
    const view = new DataView(rawWasmBuffer);
    const bytes = new Uint8Array(rawWasmBuffer);

    if (view.getUint32(0, true) !== 0x6D736100) {
        console.error("[Telemetry] Invalid WebAssembly magic number.");
        return rawWasmBuffer;
    }

    let envImportCount = 0;
    let opCallCount = 0;

    let ptr = 8; 
    
    while (ptr < bytes.length) {
        const sectionId = bytes[ptr++];
        
        let sectionSize = 0;
        let shift = 0;
        while (ptr < bytes.length) {
            const byte = bytes[ptr++];
            sectionSize |= (byte & 0x7F) << shift;
            if ((byte & 0x80) === 0) break;
            shift += 7;
        }

        if (sectionId === 2) { 
            console.log(`[Telemetry] Found Import Section (Size: ${sectionSize} bytes)`);
            for (let i = ptr; i < ptr + sectionSize - 2; i++) {
                if (bytes[i] === 101 && bytes[i+1] === 110 && bytes[i+2] === 118) { 
                    envImportCount++;
                    console.log(`[Telemetry] Found 'env' host import mapping at byte offset ${i}`);
                }
            }
        } else if (sectionId === 10) { 
            console.log(`[Telemetry] Found Code Section (Size: ${sectionSize} bytes)`);
            for (let i = ptr; i < ptr + sectionSize; i++) {
                if (bytes[i] === 0x10) {
                    opCallCount++;
                }
            }
        }
        
        ptr += sectionSize;
    }

    console.log(`[Telemetry Summary] WebAssembly Native Audit Complete.`);
    console.log(`[Telemetry Summary] Total 'env' keyword occurrences in imports: ${envImportCount}`);
    console.log(`[Telemetry Summary] Total OP_CALL (0x10) instructions detected: ${opCallCount}`);

    return rawWasmBuffer;
}

module.exports = { runWasmTelemetry };
