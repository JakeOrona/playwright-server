// Code Complexity Analysis - broken code
/*app.post("/complexity-check", async (req, res) => {
    console.log("[INFO] Received TypeScript code for complexity analysis...");

    const { code } = req.body;
    const maxComplexity = req.query.max || 10;
    const tempFilePath = "./temp.ts";

    try {
        await fs.writeFile(tempFilePath, code); 
        console.log(`[INFO] Running ESLint complexity check with max complexity ${maxComplexity}...`);

        const process = spawn("npx", [
            "eslint",
            "temp.ts",
            "--config",
            "eslint.config.cjs",
            "--no-ignore",
            "--ext",
            ".ts",
            "--format=json"
        ], { shell: true });    

        let output = "";
        let errorOutput = "";
        let responseSent = false;

        process.stdout.on("data", (data) => {
            output += data.toString();
        });

        process.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        process.on("close", async (code) => {

            console.log("[INFO] ESLint complexity check completed.");

            if (responseSent) return;

            if (code !== 0) {
                console.error("[ERROR] ESLint process failed.");
                responseSent = true;
                return res.status(500).json({ error: "ESLint failed", details: errorOutput.trim() });
            }

            try {
                if (!output.trim()) {
                    console.warn("[WARNING] ESLint returned empty output.");
                    responseSent = true;
                    return res.json({ complexityReport: [] });
                }

                const complexityReport = JSON.parse(output.trim());
                responseSent = true;
                res.json({ complexityReport });
                console.log("[SUCCESS] Complexity analysis completed.");
                await fs.unlink(tempFilePath); // ✅ Cleanup temp file
            } catch (error) {
                console.error("[ERROR] Failed to parse ESLint JSON output.");
                responseSent = true;
                res.status(500).json({ error: "Invalid ESLint JSON output", rawOutput: output });
            }
        });

    } catch (error) {
        console.error("[ERROR] Failed to process complexity check.", error);
        res.status(500).json({ error: "Failed to analyze complexity", details: error.message });
    }
});*/