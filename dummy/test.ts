import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const POLLINATIONS_IMAGE_BASE = "https://gen.pollinations.ai/image";
const IMAGE_MODEL = "nanobanana";
const MAX_SEED = 2147483647;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2;
const REDDIT_IMAGE_WIDTH = 1080;
const REDDIT_IMAGE_HEIGHT = 1350;

async function generateAndSaveImage(
    prompt: string,
    token: string,
    outputPath: string
): Promise<boolean> {
    const encodedPrompt = encodeURIComponent(prompt);
    const baseUrl = `${POLLINATIONS_IMAGE_BASE}/${encodedPrompt}`;

    console.log(`Generating image: ${prompt.substring(0, 50)}...`);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = Math.floor(Math.random() * MAX_SEED);

        const params = {
            model: IMAGE_MODEL,
            width: REDDIT_IMAGE_WIDTH,
            height: REDDIT_IMAGE_HEIGHT,
            quality: "hd",
            nologo: "true",
            private: "true",
            nofeed: "true",
            seed,
            key: token,
        };

        if (attempt === 0) {
            console.log(`Using seed: ${seed}`);
        } else {
            const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
            console.log(`Retry ${attempt}/${MAX_RETRIES - 1} with new seed: ${seed}`);
            await new Promise((resolve) => setTimeout(resolve, backoffDelay * 1000));
        }

        try {
            const response = await axios.get(baseUrl, {
                params,
                timeout: 300000,
                responseType: "arraybuffer",
            });

            if (response.status === 200) {
                const imageBytes = Buffer.from(response.data);

                if (imageBytes.length < 1000) {
                    console.log(`Image too small (${imageBytes.length} bytes), retrying...`);
                    continue;
                }

                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, imageBytes);

                console.log(
                    `Image saved: ${outputPath} (${imageBytes.length.toLocaleString()} bytes)`
                );
                return true;
            }
        } catch (error) {
            console.log(`Attempt ${attempt + 1} failed: ${error}`);
        }
    }

    console.log(`Failed to generate image after ${MAX_RETRIES} attempts`);
    return false;
}

async function main() {
    const token = process.env.POLLINATIONS_TOKEN;
    const prompt = "Comic-style illustration of a vibrant welcome banner for /r/pollinations_ai subreddit: diverse community of AI enthusiasts and developers celebrating together, speech bubbles with code snippets and AI prompts, bold comic book lettering spelling 'Welcome to /r/pollinations_ai', bright colors, thick black outlines, retro comic aesthetic, Reddit mascot vibes, energetic and inclusive atmosphere, high clarity";
    const outputPath = "generated_image.png";

    if (!token) {
        console.error("Error: POLLINATIONS_TOKEN env var required");
        process.exit(1);
    }

    const success = await generateAndSaveImage(prompt, token, outputPath);
    process.exit(success ? 0 : 1);
}

main();