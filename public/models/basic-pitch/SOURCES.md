# Where this model came from

`model.json` and `group1-shard1of1.bin` are Basic Pitch, Spotify's model for
note transcription, copied unchanged from the npm package
[`@spotify/basic-pitch`](https://github.com/spotify/basic-pitch-ts) 1.0.1.
`LICENSE` is that package's licence file, Apache 2.0, which permits copying
the model as long as the licence travels with it.

SHA-256, to tell later whether a file was changed:

```
1ed1aaee3409ec1dc098c8b01f430c0911f6fe9412e7af8086750f9e8f302f68  model.json
b142a95737a52e1e412d5f92e73d8bb80dfe8d04941acc0702f11f4524fb377c  group1-shard1of1.bin
```

Only the model is used, not the package. The package depends on
TensorFlow.js 3 and installs 282 MB to do so; the model is loaded with the
current TensorFlow.js 4 instead, also Apache 2.0, and this licence covers it
too.

This folder is published, for one page: `model-test.html` times the model on
the device itself, which needs a public address. The app never loads it, and
the service worker leaves it alone. `chord-lab.html` reads it from here as
well, through `lab/basic-pitch/model.js`, its adapter, written here and not
from the package.
