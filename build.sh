#!/bin/sh
PLUGIN=$1
HR=\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#\#


if [ ! -e "$PLUGIN" ];
then
   echo "Usage: ./build.sh <BroadMask NPAPI-plugin>"
   echo "Input path to BroadMask NPAPI-plugin as first parameter"
   exit;
fi
echo "$HR"
echo "Building BroadMask-Firefox..."
echo "$HR"
mkdir -p ./build/npapi/plugins/
# Addon-SDK
pushd addon-sdk
cfx xpi
mv broadmask-firefox.xpi ../build/
popd

# NPAPI plugin
cp -r $PLUGIN ./build/npapi/plugins/
cp npapi-install.rdf ./build/npapi/install.rdf
pushd ./build/npapi/
zip -r ../broadmask-npapi.xpi .
popd


# MPI
cp ./mpi-install.rdf ./build/install.rdf
pushd build
zip -r ../broadmask-firefox.xpi ./install.rdf ./broadmask-npapi.xpi ./broadmask-firefox.xpi
popd

# Cleanup
rm -r ./build/

echo "$HR"
echo "Extension bundle written to $PWD/broadmask-firefox.xpi"
