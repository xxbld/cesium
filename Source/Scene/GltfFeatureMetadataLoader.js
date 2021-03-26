import Check from "../Core/Check.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import when from "../ThirdParty/when.js";
import CacheResource from "./CacheResource.js";
import CacheResourceState from "./CacheResourceState.js";
import MetadataGltfExtension from "./MetadataGltfExtension.js";
import ResourceCache from "./ResourceCache.js";

/**
 * Loads glTF feature metadata.
 * <p>
 * Implements the {@link CacheResource} interface.
 * </p>
 *
 * @alias GltfFeatureMetadataLoader
 * @constructor
 * @augments CacheResource
 *
 * @param {Object} options Object with the following properties:
 * @param {Object} options.gltf The glTF JSON.
 * @param {Resource} options.gltfResource The {@link Resource} pointing to the glTF file.
 * @param {Resource} options.baseResource The {@link Resource} that paths in the glTF JSON are relative to.
 * @param {String} options.extension The feature metadata extension object.
 * @param {Boolean} [options.asynchronous=true] Determines if WebGL resource creation will be spread out over several frames or block until all WebGL resources are created.
 *
 * @private
 */
function GltfFeatureMetadataLoader(options) {
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);
  var gltf = options.gltf;
  var gltfResource = options.gltfResource;
  var baseResource = options.baseResource;
  var extension = options.extension;
  var asynchronous = defaultValue(options.asynchronous, true);

  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("options.gltf", gltf);
  Check.typeOf.object("options.gltfResource", gltfResource);
  Check.typeOf.object("options.baseResource", baseResource);
  Check.typeOf.object("options.extension", extension);
  //>>includeEnd('debug');

  this._gltfResource = gltfResource;
  this._baseResource = baseResource;
  this._gltf = gltf;
  this._extension = extension;
  this._asynchronous = asynchronous;
  this._bufferViewCacheResources = undefined;
  this._schemaCacheResource = undefined;
  this._featureMetadata = undefined;
  this._state = CacheResourceState.UNLOADED;
  this._promise = when.defer();
}

Object.defineProperties(GltfFeatureMetadataLoader.prototype, {
  /**
   * A promise that resolves to the resource when the resource is ready.
   *
   * @memberof GltfFeatureMetadataLoader.prototype
   *
   * @type {Promise.<GltfFeatureMetadataLoader>}
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
   * @memberof BufferCacheResource.prototype
   *
   * @type {String}
   * @readonly
   */
  cacheKey: {
    get: function () {
      return undefined;
    },
  },
  /**
   * Feature metadata.
   *
   * @memberof GltfFeatureMetadataLoader.prototype
   * @type {FeatureMetadata}
   * @readonly
   * @private
   */
  featureMetadata: {
    get: function () {
      return this._featureMetadata;
    },
  },
});

function loadBufferViews(featureMetadataLoader) {
  var extension = featureMetadataLoader._extension;
  var featureTables = extension.featureTables;

  // Gather the used buffer views
  var bufferViewIds = {};
  if (defined(featureTables)) {
    for (var featureTableId in featureTables) {
      if (featureTables.hasOwnProperty(featureTableId)) {
        var featureTable = featureTables[featureTableId];
        var properties = featureTable.properties;
        if (defined(properties)) {
          for (var propertyId in properties) {
            if (properties.hasOwnProperty(propertyId)) {
              var property = properties[propertyId];
              var bufferView = property.bufferView;
              var arrayOffsetBufferView = property.arrayOffsetBufferView;
              var stringOffsetBufferView = property.stringOffsetBufferView;
              if (defined(bufferView)) {
                bufferViewIds[bufferView] = true;
              }
              if (defined(arrayOffsetBufferView)) {
                bufferViewIds[arrayOffsetBufferView] = true;
              }
              if (defined(stringOffsetBufferView)) {
                bufferViewIds[stringOffsetBufferView] = true;
              }
            }
          }
        }
      }
    }
  }

  // Load the buffer views
  var bufferViewCacheResources = {};
  var bufferViewPromises = [];
  for (var bufferViewId in bufferViewIds) {
    if (bufferViewIds.hasOwnProperty(bufferViewId)) {
      var bufferViewCacheResource = ResourceCache.loadBufferView({
        gltf: featureMetadataLoader._gltf,
        bufferViewId: bufferViewId,
        gltfResource: featureMetadataLoader._gltfResource,
        baseResource: featureMetadataLoader._baseResource,
        keepResident: false,
      });
      bufferViewCacheResources[bufferViewId] = bufferViewCacheResource;
      bufferViewPromises.push(bufferViewCacheResource.promise);
    }
  }

  featureMetadataLoader._bufferViewCacheResources = bufferViewCacheResources;

  // Return a promise to the buffer views dictionary
  return when.all(bufferViewPromises).then(function () {
    var bufferViews = {};
    var bufferViewCacheResources =
      featureMetadataLoader._bufferViewCacheResources;
    for (var bufferViewId in bufferViewCacheResources) {
      if (bufferViewCacheResources.hasOwnProperty(bufferViewId)) {
        var bufferViewCacheResource = bufferViewCacheResources[bufferViewId];
        var typedArray = bufferViewCacheResource.typedArray;
        bufferViews[bufferViewId] = typedArray;
      }
    }
    return bufferViews;
  });
}

function loadSchema(featureMetadataLoader) {
  var extension = featureMetadataLoader._extension;

  var schemaCacheResource;
  if (defined(extension.schemaUri)) {
    var resource = featureMetadataLoader._baseResource.getDerivedResource({
      url: extension.schemaUri,
      preserveQueryParameters: true,
    });
    schemaCacheResource = ResourceCache.loadSchema({
      resource: resource,
    });
  } else {
    schemaCacheResource = ResourceCache.loadSchema({
      schema: extension.schema,
    });
  }

  featureMetadataLoader._schemaCacheResource = schemaCacheResource;

  return schemaCacheResource.promise;
}

function loadFeatureTextures(featureMetadataLoader) {
  var extension = featureMetadataLoader._extension;
  var featureTextures = extension.featureTextures;


  var textureCacheResources = {};
  if (defined(featureTextures)) {
    for (var featureTextureId in featureTextures) {
      if (featureTextures.hasOwnProperty(featureTextureId)) {
        var featureTexture = featureTextures[featureTextureId];
        var properties = featureTexture.properties;
        if (defined(properties)) {
          for (var propertyId in properties) {
            if (properties.hasOwnProperty(propertyId)) {
              var property = properties[propertyId];
              var textureInfo = property.textureInfo;
              var textureCacheResource = ResourceCache.loadTexture({
                gltf: featureMetadataLoader._gltf,
                textureInfo: textureInfo,
                gltfResource: featureMetadataLoader._gltfResource,
                baseResource: featureMetadataLoader._baseResource,
                supportedImageFormats: supportedImageFormats,
                keepResident: false,
                asynchronous: featureMetadataLoader._asynchronous
              });


              textureId = property.texture.index;
              textureIds[textureId] = true;
            }
          }
        }
      }
    }
  }

  // Load the textures
  var textureCacheResources = {};
  var texturePromises = [];
  for (textureId in textureIds) {
    if (textureIds.hasOwnProperty(textureId)) {
      var textureCacheResource = ResourceCache.loadTexture({
        gltf: featureMetadataLoader._gltf,
        textureInfo: 
        bufferViewId: bufferViewId,
        gltfResource: featureMetadataLoader._gltfResource,
        baseResource: featureMetadataLoader._baseResource,
        keepResident: false,
      });
      bufferViewCacheResources[bufferViewId] = bufferViewCacheResource;
      bufferViewPromises.push(bufferViewCacheResource.promise);
    }
  }

  featureMetadataLoader._bufferViewCacheResources = bufferViewCacheResources;

  // Return a promise to the buffer views dictionary
  return when.all(bufferViewPromises).then(function () {
    var bufferViews = {};
    var bufferViewCacheResources =
      featureMetadataLoader._bufferViewCacheResources;
    for (var bufferViewId in bufferViewCacheResources) {
      if (bufferViewCacheResources.hasOwnProperty(bufferViewId)) {
        var bufferViewCacheResource = bufferViewCacheResources[bufferViewId];
        var typedArray = bufferViewCacheResource.typedArray;
        bufferViews[bufferViewId] = typedArray;
      }
    }
    return bufferViews;
  });
}

/**
 * Loads the resource.
 */
GltfFeatureMetadataLoader.prototype.load = function () {
  var bufferViewsPromise = loadBufferViews(this);
  var schemaPromise = loadSchema(this);
  var featureTexturesPromise = loadFeatureTextures(this);

  this._gltf = undefined; // No longer need the glTF

  when
    .all([schemaCacheResource.promise, bufferViewsPromise])
    .then(function (results) {
      if (that._state === CacheResourceState.UNLOADED) {
        unload(that);
        return;
      }
      that._featureMetadata = new MetadataGltfExtension({
        extension: that._extension,
        schema: results[0],
        bufferViews: results[1],
      });
      that._state = CacheResourceState.READY;
      that._promise.resolve(that);
    })
    .otherwise(function (error) {
      unload(that);
      that._state = CacheResourceState.FAILED;
      var errorMessage = "Failed to load feature metadata";
      that._promise.reject(CacheResource.getError(error, errorMessage));
    });
};

function unload(GltfFeatureMetadataLoader) {
  var bufferViewCacheResources =
    GltfFeatureMetadataLoader._bufferViewCacheResources;
  for (var bufferViewId in bufferViewCacheResources) {
    if (bufferViewCacheResources.hasOwnProperty(bufferViewId)) {
      var bufferViewCacheResource = bufferViewCacheResources[bufferViewId];
      ResourceCache.unload(bufferViewCacheResource);
    }
  }

  var textureCacheResources
}

/**
 * Unloads the resource.
 */
GltfFeatureMetadataLoader.prototype.unload = function () {
  unload(this);
  this._state = CacheResourceState.UNLOADED;
};

export default GltfFeatureMetadataLoader;
