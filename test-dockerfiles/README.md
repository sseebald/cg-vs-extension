# Test Dockerfiles

Test cases for the Chainguard VS Code Extension

## 📚 NEW: Library Detection Examples

**Location**: See [LIBRARY-EXAMPLES-README.md](./LIBRARY-EXAMPLES-README.md) for detailed guide

Quick test examples:
- **Python**: `python-flask/Dockerfile` - Flask app with 15 dependencies
- **Node.js**: `nodejs-express/Dockerfile` - Express API with 16 packages
- **Java Maven**: `java-spring/Dockerfile` - Spring Boot with Maven
- **Java Gradle**: `java-gradle/Dockerfile` - Spring Boot with Gradle
- **Multi-ecosystem**: `multi-ecosystem/Dockerfile` - Combined Python + Node.js

### Quick Demo
1. Enable: `"chainguard.enableLibraryDetection": true`
2. Open any example Dockerfile
3. **Hover over the COPY line** with dependency file (requirements.txt, package.json, pom.xml)
4. See library detection, authentication status, and CVE remediation info!

---

## Original Image Conversion Examples

- `Dockerfile.simple` - Basic FROM conversion
- `Dockerfile.python` - Python with apt packages
- `Dockerfile.node` - Node.js application
- `Dockerfile.fedora` - Fedora with dnf packages
- `Dockerfile.multistage` - Multi-stage build
- `Dockerfile.test-run` - RUN command conversions

## Testing Checklist

**Image Conversion:**
- [ ] FROM lines show Chainguard equivalents
- [ ] apt-get converts to apk
- [ ] dnf/yum converts to apk
- [ ] User management suggestions work

**Library Detection:** (NEW)
- [ ] Python requirements.txt detection
- [ ] Node.js package.json detection
- [ ] Java pom.xml detection
- [ ] Java build.gradle detection
- [ ] CVE remediation counts display
- [ ] Code actions trigger correctly
