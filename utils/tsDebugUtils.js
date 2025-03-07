// TypeScript Debugging - broken code
app.post("/type-check", async (req, res) => {
    console.log("[INFO] Received TypeScript code for checking...");

    const { code } = req.body;
    const tempFilePath = "./temp.ts";

    try {
        await fs.writeFile(tempFilePath, code);

        console.log("[INFO] Running TypeScript checks...");

        const process = spawn("cmd.exe", ["/c", "npx tsc --noEmit temp.ts"], { shell: true });

        let output = "";
        let errorOutput = "";

        process.stdout.on("data", (data) => {
            output += data.toString();
        });

        process.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        process.on("close", async (code) => {
            await fs.unlink(tempFilePath);

            if (code !== 0) {
                console.error("[ERROR] TypeScript errors detected.");
                return res.status(400).json({ errors: errorOutput.trim() });
            }

            console.log("[SUCCESS] No TypeScript errors detected.");
            res.json({ message: "No TypeScript errors detected" });
        });

    } catch (error) {
        console.error("[ERROR] Failed to process TypeScript code.", error);
        res.status(500).json({ error: "Failed to check TypeScript code", details: error.message });
    }
});