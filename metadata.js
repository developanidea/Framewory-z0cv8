function unpackUnityWebData(dataBuffer) {
    console.log("[Telemetry] Initiating UnityWebData virtual unpacker...");
    const view = new DataView(dataBuffer);
    
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
    
    let currentPtr = 18; 
    let metadataBuffer = null;
    
    console.log("[Telemetry] Scanning .data directory entries...");
    
    while (currentPtr < view.byteLength) {
        const fileOffset = view.getUint32(currentPtr, true);
        currentPtr += 4;
        
        const fileSize = view.getUint32(currentPtr, true);
        currentPtr += 4;
        
        const pathLength = view.getUint32(currentPtr, true);
        currentPtr += 4;
        
        let filePath = "";
        for (let i = 0; i < pathLength; i++) {
            filePath += String.fromCharCode(view.getUint8(currentPtr + i));
        }
        currentPtr += pathLength;
        
        console.log(`[Telemetry] Found bundled file: ${filePath} (Size: ${fileSize} bytes)`);
        
        if (filePath.includes("global-metadata.dat")) {
            console.log(`[Telemetry] SUCCESS: Isolated global-metadata.dat at offset ${fileOffset}`);
            metadataBuffer = dataBuffer.slice(fileOffset, fileOffset + fileSize);
            break;
        }
    }
    
    if (metadataBuffer) {
        console.log("[Telemetry] Piping extracted buffer to IL2CPP parser...");
        return parseMetadataTelemetry(metadataBuffer);
    } else {
        console.error("[Telemetry] Failed to locate global-metadata.dat within the .data bundle.");
        return null;
    }
}

function parseMetadataTelemetry(buffer) {
    const view = new DataView(buffer);
    
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

    const stringOffset = view.getUint32(0x18, true); 
    const stringCount = view.getUint32(0x1C, true);
    
    const imagesOffset = view.getUint32(0x100, true);
    const imagesSize = view.getUint32(0x104, true);
    
    const imageDefinitionSize = 40; 
    const imagesCount = Math.floor(imagesSize / imageDefinitionSize);

    console.log(`[Telemetry] String Table Layout: Offset 0x${stringOffset.toString(16)}, Size: ${stringCount}`);
    console.log(`[Telemetry] Beginning structural audit for Assembly Image definitions...`);

    let detectedAssemblies = 0;

    for (let i = 0; i < imagesCount; i++) {
        const currentPtr = imagesOffset + (i * imageDefinitionSize);
        if (currentPtr + 4 <= view.byteLength) {
            const nameIndex = view.getUint32(currentPtr, true);
            
            const stringPtr = stringOffset + nameIndex;
            if (stringPtr < view.byteLength) {
                let name = "";
                let charPtr = stringPtr;
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

module.exports = { unpackUnityWebData };
