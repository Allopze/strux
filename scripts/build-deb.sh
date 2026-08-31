#!/usr/bin/env bash
set -e

# 📦 Build Debian/Ubuntu Package (.deb) for UI/UX Auditor
VERSION="0.1.0"
ARCH="amd64"
PKG_NAME="uiux-audit"
PKG_DIR="dist/deb/${PKG_NAME}_${VERSION}_${ARCH}"
OUTPUT_DEB="dist/${PKG_NAME}_${VERSION}_${ARCH}.deb"

echo "Building Debian package: $OUTPUT_DEB..."

# 1. Clean previous build directory
BUILD_TMP="/tmp/uiux-audit-deb-staging"
rm -rf "$BUILD_TMP"
mkdir -p "$BUILD_TMP/$PKG_DIR/DEBIAN"
mkdir -p "$BUILD_TMP/$PKG_DIR/usr/bin"
mkdir -p "$BUILD_TMP/$PKG_DIR/usr/lib/$PKG_NAME"

# 2. Compile project
npm run build

# 3. Create DEBIAN/control file
cat <<EOF > "$BUILD_TMP/$PKG_DIR/DEBIAN/control"
Package: $PKG_NAME
Version: $VERSION
Section: devel
Priority: optional
Architecture: $ARCH
Maintainer: Autonomous Auditor Team <info@example.com>
Depends: nodejs (>= 20.0.0)
Description: Autonomous UI/UX, Accessibility and Usability Auditor
 Evidence-based UI/UX auditor combining Playwright, axe-core WCAG analysis,
 deterministic layout rules, autonomous verifier, and interactive Terminal UI.
EOF

# 4. Create post-install script
cat <<EOF > "$BUILD_TMP/$PKG_DIR/DEBIAN/postinst"
#!/usr/bin/env bash
set -e
# Install Playwright browser dependencies if missing
if command -v npx >/dev/null 2>&1; then
    npx playwright install chromium >/dev/null 2>&1 || true
fi
EOF
chmod 755 "$BUILD_TMP/$PKG_DIR/DEBIAN/postinst"

# 5. Copy built assets and libraries
cp -r dist/ "$BUILD_TMP/$PKG_DIR/usr/lib/$PKG_NAME/dist"
cp -r node_modules/ "$BUILD_TMP/$PKG_DIR/usr/lib/$PKG_NAME/node_modules"
cp -r .agents/ "$BUILD_TMP/$PKG_DIR/usr/lib/$PKG_NAME/.agents"
cp package.json "$BUILD_TMP/$PKG_DIR/usr/lib/$PKG_NAME/"

# 6. Create binary launcher wrapper in /usr/bin/uiux-audit
cat <<EOF > "$BUILD_TMP/$PKG_DIR/usr/bin/$PKG_NAME"
#!/usr/bin/env bash
exec node /usr/lib/$PKG_NAME/dist/cli/index.js "\$@"
EOF
chmod 755 "$BUILD_TMP/$PKG_DIR/usr/bin/$PKG_NAME"

# 7. Build .deb package
mkdir -p dist
dpkg-deb --root-owner-group --build "$BUILD_TMP/$PKG_DIR" "$OUTPUT_DEB"
rm -rf "$BUILD_TMP"

echo "✨ Package created successfully: $OUTPUT_DEB"
