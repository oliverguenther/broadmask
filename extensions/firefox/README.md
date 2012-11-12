# BroadMask Firefox extension

This extension provides access to BroadMask features for privacy-preserving communication in Facebook.

To read about the functionality of BroadMask, see [http://www.broadmask.de](http://www.broadmask.de).

## Building from source

In order to build the extension, you need to build the NPAPI-plugin first. Instructions on building it and downloads for
binaries is available at: [https://github.com/oliverguenther/broadmask-npapi](https://github.com/oliverguenther/broadmask-npapi).

Once you've obtained (either by compiling it for your architecture or downloading it) the NPAPI binary, you pass it to the build script:

`./build.sh <path-to-npapi-binary>`

The Build script compiles the Addon-SDK code (requires the Addon-SDK) and combines the extension and NPAPI plugin into a [Multiple Item Package](https://developer.mozilla.org/en-US/docs/Multiple_Item_Packaging)
