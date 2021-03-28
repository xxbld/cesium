import Check from "../Core/Check.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import loadCRN from "../Core/loadCRN.js";
import loadImageFromTypedArray from "../Core/loadImageFromTypedArray.js";
import loadKTX from "../Core/loadKTX.js";
import RuntimeError from "../Core/RuntimeError.js";
import when from "../ThirdParty/when.js";
import GltfLoaderUtil from "./GltfLoaderUtil.js";
import ResourceLoader from "./ResourceLoader.js";
import ResourceLoaderState from "./ResourceLoaderState.js";

/**
 * Loads a glTF image.
 * <p>
 * Implements the {@link ResourceLoader} interface.
 * </p>
 *
 * @alias GltfImageLoader
 * @constructor
 * @augments ResourceLoader
 *
 * @param {Object} options Object with the following properties:
 * @param {ResourceCache} options.resourceCache The {@link ResourceCache} (to avoid circular dependencies).
 * @param {Object} options.gltf The glTF JSON.
 * @param {Number} options.imageId The image ID.
 * @param {Resource} options.gltfResource The {@link Resource} pointing to the glTF file.
 * @param {Resource} options.baseResource The {@link Resource} that paths in the glTF JSON are relative to.
 * @param {Object.<String, Boolean>} options.supportedImageFormats The supported image formats.
 * @param {Boolean} options.supportedImageFormats.webp Whether the browser supports WebP images.
 * @param {Boolean} options.supportedImageFormats.s3tc Whether the browser supports s3tc compressed images.
 * @param {Boolean} options.supportedImageFormats.pvrtc Whether the browser supports pvrtc compressed images.
 * @param {Boolean} options.supportedImageFormats.etc1 Whether the browser supports etc1 compressed images.
 * @param {String} [options.cacheKey] The cache key of the resource.
 *
 * @private
 */
export default function GltfImageLoader(options) {
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);
  var resourceCache = options.resourceCache;
  var gltf = options.gltf;
  var imageId = options.imageId;
  var gltfResource = options.gltfResource;
  var baseResource = options.baseResource;
  var supportedImageFormats = defaultValue(
    options.supportedImageFormats,
    defaultValue.EMPTY_OBJECT
  );
  var supportsWebP = supportedImageFormats.webp;
  var supportsS3tc = supportedImageFormats.s3tc;
  var supportsPvrtc = supportedImageFormats.pvrtc;
  var supportsEtc1 = supportedImageFormats.etc1;
  var cacheKey = options.cacheKey;

  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.func("options.resourceCache", resourceCache);
  Check.typeOf.object("options.gltf", gltf);
  Check.typeOf.number("options.imageId", imageId);
  Check.typeOf.object("options.gltfResource", gltfResource);
  Check.typeOf.object("options.baseResource", baseResource);
  Check.typeOf.boolean("options.supportedImageFormats.webp", supportsWebP);
  Check.typeOf.boolean("options.supportedImageFormats.s3tc", supportsS3tc);
  Check.typeOf.boolean("options.supportedImageFormats.pvrtc", supportsPvrtc);
  Check.typeOf.boolean("options.supportedImageFormats.etc1", supportsEtc1);
  //>>includeEnd('debug');

  var results = GltfLoaderUtil.getImageUriOrBufferView({
    gltf: gltf,
    imageId: imageId,
    supportedImageFormats: supportedImageFormats,
  });

  var bufferViewId = results.bufferViewId;
  var uri = results.uri;

  this._resourceCache = resourceCache;
  this._gltfResource = gltfResource;
  this._baseResource = baseResource;
  this._gltf = gltf;
  this._bufferViewId = bufferViewId;
  this._uri = uri;
  this._cacheKey = cacheKey;
  this._bufferViewLoader = undefined;
  this._image = undefined;
  this._state = ResourceLoaderState.UNLOADED;
  this._promise = when.defer();
}

Object.defineProperties(GltfImageLoader.prototype, {
  /**
   * A promise that resolves to the resource when the resource is ready.
   *
   * @memberof GltfImageLoader.prototype
   *
   * @type {Promise.<GltfImageLoader>}
   * @readonly
   */
  promise: {
    get: function () {
      return this._promise.promise;
    },
  },
  /**
   * The cache key of the resource.
   *
   * @memberof GltfImageLoader.prototype
   *
   * @type {String}
   * @readonly
   */
  cacheKey: {
    get: function () {
      return this._cacheKey;
    },
  },
  /**
   * The image.
   *
   * @memberof GltfImageLoader.prototype
   *
   * @type {Image|ImageBitmap|CompressedTextureBuffer}
   * @readonly
   */
  image: {
    get: function () {
      return this._image;
    },
  },
});

/**
 * Loads the resource.
 */
GltfImageLoader.prototype.load = function () {
  if (defined(this._bufferViewId)) {
    loadFromBufferView(this);
  } else {
    loadFromUri(this);
  }
};

function loadFromBufferView(imageLoader) {
  var resourceCache = imageLoader._resourceCache;
  var bufferViewLoader = resourceCache.loadBufferView({
    gltf: imageLoader._gltf,
    bufferViewId: imageLoader._bufferViewId,
    gltfResource: imageLoader._gltfResource,
    baseResource: imageLoader._baseResource,
    keepResident: false,
  });
  imageLoader._state = ResourceLoaderState.LOADING;
  imageLoader._bufferViewLoader = bufferViewLoader;

  bufferViewLoader.promise
    .then(function () {
      if (imageLoader._state === ResourceLoaderState.DESTROYED) {
        unload(imageLoader);
        return;
      }

      var typedArray = bufferViewLoader.typedArray;
      return loadImageFromBufferTypedArray(typedArray).then(function (image) {
        if (imageLoader._state === ResourceLoaderState.DESTROYED) {
          unload(imageLoader);
          return;
        }

        // Unload everything except the image
        unload(imageLoader);

        imageLoader._image = image;
        imageLoader._state = ResourceLoaderState.READY;
        imageLoader._promise.resolve(imageLoader);
      });
    })
    .otherwise(function (error) {
      handleError(imageLoader, error, "Failed to load embedded image");
    });
}

function loadFromUri(imageLoader) {
  var baseResource = imageLoader._baseResource;
  var uri = imageLoader._uri;
  var resource = baseResource.getDerivedResource({
    url: uri,
  });
  imageLoader._state = ResourceLoaderState.LOADING;
  loadImageFromUri(resource)
    .then(function (image) {
      if (imageLoader._state === ResourceLoaderState.DESTROYED) {
        unload(imageLoader);
        return;
      }

      // Unload everything except the image
      unload(imageLoader);

      imageLoader._image = image;
      imageLoader._state = ResourceLoaderState.READY;
      imageLoader._promise.resolve(imageLoader);
    })
    .otherwise(function (error) {
      handleError(imageLoader, error, "Failed to load image:" + uri);
    });
}

function handleError(imageLoader, error, errorMessage) {
  unload(imageLoader);
  imageLoader._state = ResourceLoaderState.FAILED;
  imageLoader._promise.reject(ResourceLoader.getError(error, errorMessage));
}

function getMimeTypeFromTypedArray(typedArray) {
  var header = typedArray.subarray(0, 2);
  var webpHeaderRIFFChars = typedArray.subarray(0, 4);
  var webpHeaderWEBPChars = typedArray.subarray(8, 12);

  if (header[0] === 0x42 && header[1] === 0x49) {
    return "image/bmp";
  } else if (header[0] === 0x47 && header[1] === 0x49) {
    return "image/gif";
  } else if (header[0] === 0xff && header[1] === 0xd8) {
    return "image/jpeg";
  } else if (header[0] === 0x89 && header[1] === 0x50) {
    return "image/png";
  } else if (header[0] === 0xab && header[1] === 0x4b) {
    return "image/ktx";
  } else if (header[0] === 0x48 && header[1] === 0x78) {
    return "image/crn";
  } else if (header[0] === 0x73 && header[1] === 0x42) {
    return "image/basis";
  } else if (
    webpHeaderRIFFChars[0] === 0x52 &&
    webpHeaderRIFFChars[1] === 0x49 &&
    webpHeaderRIFFChars[2] === 0x46 &&
    webpHeaderRIFFChars[3] === 0x46 &&
    webpHeaderWEBPChars[0] === 0x57 &&
    webpHeaderWEBPChars[1] === 0x45 &&
    webpHeaderWEBPChars[2] === 0x42 &&
    webpHeaderWEBPChars[3] === 0x50
  ) {
    return "image/webp";
  }

  throw new RuntimeError("Image data does not have valid header");
}

function loadImageFromBufferTypedArray(typedArray) {
  var mimeType = getMimeTypeFromTypedArray(typedArray);
  if (mimeType === "image/ktx") {
    // Resolves to a CompressedTextureBuffer
    return loadKTX(typedArray);
  } else if (mimeType === "image/crn") {
    // Resolves to a CompressedTextureBuffer
    return loadCRN(typedArray);
  }
  // Resolves to an Image or ImageBitmap
  return loadImageFromTypedArray({
    uint8Array: typedArray,
    format: mimeType,
    flipY: false,
  });
}

var ktxRegex = /(^data:image\/ktx)|(\.ktx$)/i;
var crnRegex = /(^data:image\/crn)|(\.crn$)/i;

function loadImageFromUri(resource) {
  var uri = resource.url;
  if (ktxRegex.test(uri)) {
    // Resolves to a CompressedTextureBuffer
    return loadKTX(resource);
  } else if (crnRegex.test(uri)) {
    // Resolves to a CompressedTextureBuffer
    return loadCRN(resource);
  }
  // Resolves to an ImageBitmap or Image
  return resource.fetchImage();
}

function unload(imageLoader) {
  if (defined(imageLoader._bufferViewLoader)) {
    var resourceCache = imageLoader._resourceCache;
    resourceCache.unload(imageLoader._bufferViewLoader);
  }

  imageLoader._bufferViewLoader = undefined;
  imageLoader._uri = undefined; // Free in case the uri is a data uri
  imageLoader._image = undefined;
  imageLoader._gltf = undefined;
}

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @returns {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see GltfImageLoader#destroy
 */
GltfImageLoader.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the loaded resource.
 * <br /><br />
 * Once an object is destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
 * assign the return value (<code>undefined</code>) to the object as done in the example.
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 * @example
 * imageLoader = imageLoader && imageLoader.destroy();
 *
 * @see GltfImageLoader#isDestroyed
 */
GltfImageLoader.prototype.destroy = function () {
  unload(this);
  this._state = ResourceLoaderState.DESTROYED;

  return destroyObject(this);
};
