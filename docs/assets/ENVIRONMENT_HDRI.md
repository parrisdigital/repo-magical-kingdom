# Neutral daylight environment HDRI

The optional desktop environment-lighting vocabulary contains one compact,
unmodified 1K Radiance HDR from Poly Haven. It is reserved for reflections and
image-based lighting (IBL). It must not be assigned to `scene.background`; the
authored procedural sky remains the visible environment.

## Source and license proof

- Asset: [Kloofendal Overcast (Pure Sky)](https://polyhaven.com/a/kloofendal_overcast_puresky)
- Author: Greg Zaal
- Source: [official Poly Haven 1K HDR](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_overcast_puresky_1k.hdr)
- Lighting character: 5303 K, 6 EV, soft low-contrast overcast daylight
- License: [Poly Haven CC0 declaration](https://polyhaven.com/license) and
  [CC0 1.0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)

The [machine-readable manifest](../../public/assets/world/environment/polyhaven/environment-manifest.json)
records the canonical page, exact official download URL, author, upstream API
byte count and MD5, independent SHA-256, dimensions, intended use, and runtime
memory contract. The distributed `.hdr` bytes are identical to Poly Haven's
official 1K file; no larger HDRI, EXR, preview, or source archive is included.

## Runtime contract and budget

| Stage                               |     Cost |
| ----------------------------------- | -------: |
| Network/disk Radiance HDR           | 1.12 MiB |
| `HDRLoader` half-float RGBA decode  |    4 MiB |
| Retained 256px CubeUV PMREM RGBA16F |    6 MiB |
| Estimated PMREM-generation GPU peak |   16 MiB |

The 1024 x 512 equirectangular source is Three's documented ideal input size
for a 256 x 256 PMREM cube. The retained estimate is the 768 x 1024 half-float
CubeUV target. The peak includes the 4 MiB source texture plus 6 MiB output and
6 MiB temporary ping-pong target; dispose the source texture and PMREM generator
after conversion. Use Three's current `HDRLoader`, `HalfFloatType`,
`LinearSRGBColorSpace`, and `EquirectangularReflectionMapping` contract.

## Deterministic rebuild and verification

Download the exact official 1K `.hdr` linked above, then run:

```bash
pnpm assets:environment:build -- \
  --source "/path/to/kloofendal_overcast_puresky_1k.hdr"
pnpm assets:environment:verify
node attribution/validate.mjs
```

The builder makes no network requests. It refuses any source whose basename,
byte count, MD5, SHA-256, Radiance encoding, or dimensions differ from the
reviewed file, then copies the verified bytes unchanged. The verifier also
rejects unregistered files, background use, a payload above 1.25 MiB, or drift
from the documented loader and PMREM memory contract.
