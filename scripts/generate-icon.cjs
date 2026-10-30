/**
 * Convert the generated JPG icon to a multi-resolution .ico file
 * suitable for Windows executables and installers.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', 'assets', 'fryfreeze-logo.jpg');
const OUT_DIR = path.resolve(__dirname, '..', 'assets');
const ICO_PATH = path.resolve(OUT_DIR, 'icon.ico');
const PNG_PATH = path.resolve(OUT_DIR, 'icon.png');

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Create the 256x256 PNG that electron-builder needs
  console.log('Converting source image to 256x256 PNG...');
  await sharp(SOURCE).resize(256, 256).png().toFile(PNG_PATH);

  // Use the default export of png-to-ico (ESM module) via dynamic import
  // It takes a file path and automatically generates all ICO sizes
  const pngToIco = await import('png-to-ico');
  const convert = pngToIco.default;

  console.log('Generating multi-resolution ICO from 256x256 PNG...');
  const icoBuffer = await convert(PNG_PATH);
  fs.writeFileSync(ICO_PATH, icoBuffer);

  console.log(`✅ Icon files created:`);
  console.log(`   ${ICO_PATH}`);
  console.log(`   ${PNG_PATH}`);
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
