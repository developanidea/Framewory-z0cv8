export function unpackUnityWebData(dataBuffer) {
    console.log("[Telemetry] Initiating UnityWebData virtual unpacker...");
    const view = new DataView(dataBuffer);
    
    // 1. Read the .data file header
    let signature = "";
    for (let i = 0; i < 15; i++) {
        const charCode = view.getUint8(i);
        if (charCode === 0) break;
        signature += String.fromCharCode(charCode);
    }
    
    if (signature !== "UnityWebData1.0") {
        console.error("[Telemetry] Invalid UnityWebData signature:", signature);
        return null;
    }
    
    // Directory entries usually start around offset 18 after the signature and header lengths
    let currentPtr = 18; 
    let metadataBuffer = null;
    
    console.log("[Telemetry] Scanning .data directory entries...");
    
    // 2. Loop through the directory entries
    while (currentPtr < view.byteLength) {
        // Directory entry structure: [offset] [size] [path length] [path string]
        const fileOffset = view.getUint32(currentPtr, true);
        currentPtr += 4;
        
        const fileSize = view.getUint32(currentPtr, true);
        currentPtr += 4;
        
        const pathLength = view.getUint32(currentPtr, true);
        currentPtr += 4;
        
        // Read file path string
        let filePath = "";
        for (let i = 0; i < pathLength; i++) {
            filePath += String.fromCharCode(view.getUint8(currentPtr + i));
        }
        currentPtr += pathLength;
        
        console.log(`[Telemetry] Found bundled file: ${filePath} (Size: ${fileSize} bytes)`);
        
        // 3. Look for "global-metadata.dat"
        if (filePath.includes("global-metadata.dat")) {
            console.log(`[Telemetry] SUCCESS: Isolated global-metadata.dat at offset ${fileOffset}`);
            
            // Slice the exact byte range out of the monolithic ArrayBuffer
            metadataBuffer = dataBuffer.slice(fileOffset, fileOffset + fileSize);
            break;
        }
    }
    
    // 4. Pass the isolated bytes directly into the telemetry parser
    if (metadataBuffer) {
        console.log("[Telemetry] Piping extracted buffer to IL2CPP parser...");
        return parseMetadataTelemetry(metadataBuffer);
    } else {
        console.error("[Telemetry] Failed to locate global-metadata.dat within the .data bundle.");
        return null;
    }
}

export function parseMetadataTelemetry(buffer) {
    const view = new DataView(buffer);
    
    // IL2CPP Header Sanity Check
    const sanityCheck = view.getUint32(0, true);
    if (sanityCheck !== 0xFAB11BAF) {
        console.error("[Telemetry] Invalid metadata format mapping.");
        return null;
    }

    const version = view.getUint32(4, true);
    console.log(`[Telemetry] IL2CPP Metadata Version Found: ${version}`);

    if (version !== 29) {
        console.warn(`[Telemetry] Notice: Parser configured for v29, but detected v${version}. Offsets may be inaccurate.`);
    }

    // In IL2CPP v29, the header layout expands. The exact offsets below are structural approximations
    // representing standard header alignments for string offset arrays and image definitions.
    const stringOffset = view.getUint32(0x18, true); 
    const stringCount = view.getUint32(0x1C, true);
    
    // Image Definitions (Assemblies) are typically located further down the v29 header (approx offset 0x100)
    const imagesOffset = view.getUint32(0x100, true);
    const imagesSize = view.getUint32(0x104, true);
    
    // The size of Il2CppImageDefinition structure is typically around 40 bytes.
    const imageDefinitionSize = 40; 
    const imagesCount = Math.floor(imagesSize / imageDefinitionSize);

    console.log(`[Telemetry] String Table Layout: Offset 0x${stringOffset.toString(16)}, Size: ${stringCount}`);
    console.log(`[Telemetry] Beginning structural audit for Assembly Image definitions...`);

    let detectedAssemblies = 0;

    for (let i = 0; i < imagesCount; i++) {
        const currentPtr = imagesOffset + (i * imageDefinitionSize);
        if (currentPtr + 4 <= view.byteLength) {
            // The nameIndex is typically the first field in the ImageDefinition struct
            const nameIndex = view.getUint32(currentPtr, true);
            
            // Resolve the string name from the string table
            const stringPtr = stringOffset + nameIndex;
            if (stringPtr < view.byteLength) {
                let name = "";
                let charPtr = stringPtr;
                // Read null-terminated string
                while (charPtr < view.byteLength) {
                    const charCode = view.getUint8(charPtr);
                    if (charCode === 0) break;
                    name += String.fromCharCode(charCode);
                    charPtr++;
                }
                
                if (name.length > 0) {
                    console.log(`[Telemetry] Discovered Assembly Image: ${name}`);
                    detectedAssemblies++;
                }
            }
        }
    }

    console.log(`[Telemetry Summary] Total Assembly Images Detected: ${detectedAssemblies}`);
    
    return {
        version: version,
        stringOffset: stringOffset,
        detectedAssemblies: detectedAssemblies
    };
}