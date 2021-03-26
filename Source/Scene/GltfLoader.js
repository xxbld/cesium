import Check from "../Core/Check.js";
import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import destroyObject from "../Core/destroyObject.js";
import FeatureDetection from "../Core/FeatureDetection.js";
import Resource from "../Core/Resource.js";
import ForEach from "../ThirdParty/GltfPipeline/ForEach.js";
import ResourceCache from "./ResourceCache.js";
import MetadataGltfExtension from "./MetadataGltfExtension.js";
import ModelComponents from "./ModelComponents.js";

var VertexAttribute = ModelComponents.VertexAttribute;
var Indices = ModelComponents.Indices;
var FeatureIdAttribute = ModelComponents.FeatureIdAttribute;
var FeatureIdTexture = ModelComponents.FeatureIdTexture;
var MorphTarget = ModelComponents.MorphTarget;
var Primitive = ModelComponents.Primitive;
var Mesh = ModelComponents.Mesh;
var Instances = ModelComponents.Instances;
var Node = ModelComponents.Node;
var Texture = ModelComponents.Texture;
var Material = ModelComponents.Material;

var defaultAccept =
  "model/gltf-binary,model/gltf+json;q=0.8,application/json;q=0.2,*/*;q=0.01";

/**
 * TODO: from ArrayBuffer
 *
 * Loads a glTF model.
 *
 * @param {Object} options Object with the following properties:
 * @param {Resource|String} options.uri The uri to the glTF file.
 * @param {Resource|String} [options.basePath] The base path that paths in the glTF JSON are relative to.
 * @param {Boolean} [options.keepResident=false] Whether the glTF JSON and embedded buffers should stay in the cache indefinitely.
 * @param {Boolean} [options.asynchronous=true] Determines if WebGL resource creation will be spread out over several frames or block until all WebGL resources are created.
 *
 * @alias GltfLoader
 * @constructor
 *
 * @private
 */
export default function GltfLoader(options) {
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);
  var uri = options.uri;
  var basePath = options.basePath;
  var keepResident = defaultValue(options.keepResident, false);
  var asynchronous = defaultValue(options.asynchronous, true);

  //>>includeStart('debug', pragmas.debug);
  Check.defined("options.uri", uri);
  //>>includeEnd('debug');

  var gltfResource = Resource.createIfNeeded(uri);

  if (!defined(gltfResource.headers.Accept)) {
    gltfResource.headers.Accept = defaultAccept;
  }

  var baseResource = defined(basePath)
    ? Resource.createIfNeeded(basePath)
    : gltfResource.clone();

  this._uri = uri;
  this._gltfResource = gltfResource;
  this._baseResource = baseResource;
  this._keepResident = keepResident;
  this._asynchronous = asynchronous;
  this._gltfCacheResource = undefined;
}

GltfLoader.prototype.load = function (model, frameState) {
  var supportedImageFormats = {
    webp: FeatureDetection.supportsWebP(),
    s3tc: frameState.context.s3tc,
    pvrtc: frameState.context.pvrtc,
    etc1: frameState.context.etc1,
  };

  var gltfCacheResource = ResourceCache.loadGltf({
    gltfResource: this._gltfResource,
    baseResource: this._baseResource,
    keepResident: this._keepResident,
  });

  this._gltfCacheResource = gltfCacheResource;

  var that = this;
  gltfCacheResource.promise.then(function () {
    if (that.isDestroyed()) {
      unload(that);
      // The loader was destroyed before the promise resolved
      return;
    }

    var gltf = gltfCacheResource.gltf;
    unload(that);
    parse(that, model, gltf, supportedImageFormats);
  });
};

function loadVertexBuffer(loader, gltf, accessorId, semantic, draco) {
  var accessor = gltf.accessors[accessorId];
  var bufferViewId = accessor.bufferView;

  if (!defined(draco) && !defined(bufferViewId)) {
    return undefined;
  }

  return ResourceCache.loadVertexBuffer({
    gltf: gltf,
    gltfResource: loader._gltfResource,
    baseResource: loader._baseResource,
    bufferViewId: bufferViewId,
    draco: draco,
    dracoAttributeSemantic: semantic,
    keepResident: false,
    asynchronous: loader._asynchronous,
  });
}

function loadVertexAttribute(loader, gltf, accessorId, semantic, draco) {
  var vertexAttribute = new VertexAttribute();

  var vertexBufferCacheResource = loadVertexBuffer(
    loader,
    gltf,
    accessorId,
    semantic,
    draco
  );

  // Accessors default to all zeros when there is no buffer view
  var constantValue = defined(vertexBufferCacheResource) ? undefined : 0;

  var accessor = gltf.accessors[accessorId];
  var bufferViewId = accessor.bufferView;
  var bufferView = gltf.bufferViews[bufferViewId];

  vertexAttribute.semantic = semantic;
  vertexAttribute.constantValue = constantValue;
  vertexAttribute.byteOffset = accessor.byteOffset;
  vertexAttribute.byteStride = bufferView.byteStride;
  vertexAttribute.componentType = accessor.componentType;
  vertexAttribute.normalized = accessor.normalized;
  vertexAttribute.count = accessor.count;
  vertexAttribute.type = accessor.type;
  vertexAttribute.cacheResource = vertexBufferCacheResource;

  return vertexAttribute;
}

function loadIndexBuffer(loader, gltf, accessorId, draco) {
  var accessor = gltf.accessors[accessorId];
  var bufferViewId = accessor.bufferView;

  if (!defined(draco) && !defined(bufferViewId)) {
    return undefined;
  }

  return ResourceCache.loadIndexBuffer({
    gltf: gltf,
    accessorId: accessorId,
    gltfResource: loader._gltfResource,
    baseResource: loader._baseResource,
    draco: draco,
    keepResident: false,
    asynchronous: loader._asynchronous,
  });
}

function loadIndices(loader, gltf, accessorId, draco) {
  var indexBufferCacheResource = loadIndexBuffer(
    loader,
    gltf,
    accessorId,
    draco
  );

  // Accessors default to all zeros when there is no buffer view
  var constantValue = defined(indexBufferCacheResource) ? undefined : 0;

  var accessor = gltf.accessors[accessorId];

  var indices = new Indices();
  indices.constantValue = constantValue;
  indices.indexDatatype = accessor.componentType;
  indices.count = accessor.count;
  indices.cacheResource = indexBufferCacheResource;

  return indices;
}

function loadTexture(loader, gltf, textureInfo, supportedImageFormats) {
  var textureCacheResource = ResourceCache.loadTexture({
    gltf: gltf,
    textureInfo: textureInfo,
    gltfResource: loader._gltfResource,
    baseResource: loader._baseResource,
    supportedImageFormats: supportedImageFormats,
    keepResident: false,
    asynchronous: loader._asynchronous,
  });

  var texture = new Texture();
  texture.cacheResource = textureCacheResource;
  texture.texCoord = textureInfo.texCoord;

  return texture;
}

function loadMaterial(loader, gltf, gltfMaterial, supportedImageFormats) {
  var material = new Material();

  // Metallic roughness
  var pbrMetallicRoughness = gltfMaterial.pbrMetallicRoughness;
  if (defined(pbrMetallicRoughness)) {
    if (defined(pbrMetallicRoughness.baseColorTexture)) {
      material.baseColorTexture = loadTexture(
        loader,
        gltf,
        pbrMetallicRoughness.baseColorTexture,
        supportedImageFormats
      );
    }
    if (defined(pbrMetallicRoughness.metallicRoughnessTexture)) {
      material.metallicRoughnessTexture = loadTexture(
        loader,
        gltf,
        pbrMetallicRoughness.metallicRoughnessTexture,
        supportedImageFormats
      );
    }
    material.baseColorFactor = pbrMetallicRoughness.baseColorFactor;
    material.metallicFactor = pbrMetallicRoughness.metallicFactor;
    material.roughnessFactor = pbrMetallicRoughness.roughnessFactor;
  }

  if (defined(material.extensions)) {
    // Spec gloss extension
    var pbrSpecularGlossiness =
      material.extensions.KHR_materials_pbrSpecularGlossiness;
    if (defined(pbrSpecularGlossiness)) {
      if (defined(pbrSpecularGlossiness.diffuseTexture)) {
        material.diffuseTexture = loadTexture(
          loader,
          gltf,
          pbrSpecularGlossiness.diffuseTexture,
          supportedImageFormats
        );
      }
      if (defined(pbrSpecularGlossiness.specularGlossinessTexture)) {
        if (defined(pbrSpecularGlossiness.specularGlossinessTexture)) {
          material.specularGlossinessTexture = loadTexture(
            loader,
            gltf,
            pbrSpecularGlossiness.specularGlossinessTexture,
            supportedImageFormats
          );
        }
      }
      material.diffuseFactor = pbrSpecularGlossiness.diffuseFactor;
      material.specularFactor = pbrSpecularGlossiness.specularFactor;
      material.glossinessFactor = pbrSpecularGlossiness.glossinessFactor;
    }
  }

  // Top level textures
  if (defined(material.emissiveTexture)) {
    material.emissiveTexture = loadTexture(
      loader,
      gltf,
      material.emissiveTexture,
      supportedImageFormats
    );
  }
  if (defined(material.normalTexture)) {
    material.normalTexture = loadTexture(
      loader,
      gltf,
      material.normalTexture,
      supportedImageFormats
    );
  }
  if (defined(material.occlusionTexture)) {
    material.occlusionTexture = loadTexture(
      loader,
      gltf,
      material.occlusionTexture,
      supportedImageFormats
    );
  }
  material.emissiveFactor = gltfMaterial.emissiveFactor;
  material.alphaMode = gltfMaterial.alphaMode;
  material.alphaCutoff = gltfMaterial.alphaCutoff;
  material.doubleSided = gltfMaterial.doubleSided;

  return material;
}

function loadFeatureIdAttribute(gltfFeatureIdAttribute) {
  var featureIdAttribute = new FeatureIdAttribute();
  var featureIds = featureIdAttribute.featureIds;
  featureIdAttribute.featureTable = gltfFeatureIdAttribute.featureTable;
  featureIdAttribute.attribute = featureIds.attribute;
  featureIdAttribute.constant = featureIds.constant;
  featureIdAttribute.divisor = featureIds.divisor;
}

function loadFeatureIdTexture(
  loader,
  gltf,
  gltfFeatureIdTexture,
  supportedImageFormats
) {
  var featureIdTexture = new FeatureIdTexture();
  var featureIds = gltfFeatureIdTexture.featureIds;
  var textureInfo = featureIds.texture;

  featureIdTexture.featureTable = gltfFeatureIdTexture.featureTable;
  featureIdTexture.channels = featureIds.channels;
  featureIdTexture.texture = loadTexture(
    loader,
    gltf,
    textureInfo,
    supportedImageFormats
  );

  return featureIdTexture;
}

function loadMorphTarget(loader, gltf, gltfTarget) {
  var morphTarget = new MorphTarget();
  ForEach.meshPrimitiveTargetAttribute(gltfTarget, function (
    accessorId,
    semantic
  ) {
    var vertexAttribute = loadVertexAttribute(
      loader,
      gltf,
      accessorId,
      semantic
      // don't pass in draco object since morph targets can't be draco compressed
    );
    morphTarget.vertexAttributes.push(vertexAttribute);
  });
  return morphTarget;
}

function loadPrimitive(loader, gltf, gltfPrimitive, supportedImageFormats) {
  var primitive = new Primitive();

  var materialId = gltfPrimitive.material;
  if (defined(materialId)) {
    primitive.material = loadMaterial(
      loader,
      gltf,
      gltf.materials[materialId],
      supportedImageFormats
    );
  }

  var extensions = defaultValue(
    gltfPrimitive.extensions,
    defaultValue.EMPTY_OBJECT
  );
  var draco = extensions.KHR_draco_mesh_compression;
  var featureMetadata = extensions.EXT_feature_metadata;

  ForEach.meshPrimitiveAttribute(gltfPrimitive, function (
    accessorId,
    semantic
  ) {
    primitive.vertexAttributes.push(
      loadVertexAttribute(loader, gltf, accessorId, semantic, draco)
    );
  });

  ForEach.meshPrimitiveTarget(gltfPrimitive, function (gltfTarget) {
    primitive.morphTargets.push(loadMorphTarget(loader, gltf, gltfTarget));
  });

  if (defined(gltfPrimitive.indices)) {
    primitive.indices = loadIndices(loader, gltf, gltfPrimitive.indices, draco);
  }

  if (defined(featureMetadata)) {
    var i;

    // Feature ID Attributes
    var featureIdAttributes = featureMetadata.featureIdAttributes;
    if (defined(featureIdAttributes)) {
      var featureIdAttributesLength = featureIdAttributesLength;
      for (i = 0; i < featureIdAttributesLength; ++i) {
        primitive.featureIdAttributes.push(
          loadFeatureIdAttribute(featureIdAttributes[i])
        );
      }
    }

    // Feature ID Textures
    var featureIdTextures = featureMetadata.featureIdTextures;
    if (defined(featureIdTextures)) {
      var featureIdTexturesLength = featureIdTextures.length;
      for (i = 0; i < featureIdTexturesLength; ++i) {
        primitive.featureIdTextures.push(
          loadFeatureIdTexture(
            loader,
            gltf,
            featureIdTextures[i],
            supportedImageFormats
          )
        );
      }
    }

    // Feature Textures
    primitive.featureTextures = featureMetadata.featureTextures;
  }

  primitive.mode = gltfPrimitive.mode;

  return primitive;
}

function loadMesh(loader, gltf, gltfMesh, supportedImageFormats) {
  var mesh = new Mesh();

  ForEach.meshPrimitive(gltfMesh, function (primitive) {
    mesh.primitives.push(
      loadPrimitive(loader, gltf, primitive, supportedImageFormats)
    );
  });

  mesh.morphWeights = gltfMesh.weights;

  return mesh;
}

function loadInstances(loader, gltf, instancingExtension) {
  var instances = new Instances();
  var attributes = instancingExtension.attributes;
  if (defined(attributes)) {
    for (var semantic in attributes) {
      if (attributes.hasOwnProperty(semantic)) {
        var accessorId = attributes[semantic];
        // TODO: handle case where GPU instancing isn't supported
        instances.vertexAttributes.push(
          loadVertexAttribute(loader, gltf, accessorId, semantic)
        );
      }
    }
  }

  var extensions = defaultValue(
    instancingExtension.extensions,
    defaultValue.EMPTY_OBJECT
  );
  var featureMetadata = extensions.EXT_feature_metadata;
  if (defined(featureMetadata)) {
    var featureIdAttributes = featureMetadata.featureIdAttributes;
    if (defined(featureIdAttributes)) {
      var featureIdAttributesLength = featureIdAttributesLength;
      for (var i = 0; i < featureIdAttributesLength; ++i) {
        instances.featureIdAttributes.push(
          loadFeatureIdAttribute(featureIdAttributes[i])
        );
      }
    }
  }
  return instances;
}

function loadNode(loader, gltf, gltfNode, supportedImageFormats) {
  var node = new Node();

  var gltfMeshId = gltfNode.mesh;
  if (defined(gltfMeshId)) {
    var gltfMesh = gltf.meshes[gltfMeshId];
    node.mesh = loadMesh(loader, gltf, gltfMesh, supportedImageFormats);
  }

  var extensions = defaultValue(node.extensions, defaultValue.EMPTY_OBJECT);
  var instancingExtension = extensions.EXT_mesh_gpu_instancing;
  if (defined(instancingExtension)) {
    node.instances = loadInstances(loader, gltf, instancingExtension);
  }

  return node;
}

function loadNodes(loader, gltf, gltfNodeIds, supportedImageFormats) {
  var length = gltfNodeIds.length;
  var nodes = new Array(length);
  for (var i = 0; i < length; i++) {
    var gltfNodeId = gltfNodeIds[i];
    var gltfNode = gltf.nodes[gltfNodeId];
    var node = loadNode(loader, gltf, gltfNode, supportedImageFormats);
    nodes.push(node);

    var children = gltfNode.children;
    if (defined(children)) {
      node.children = loadNodes(loader, gltf, children, supportedImageFormats);
    }
  }
  return nodes;
}

function getSceneNodeIds(gltf) {
  var nodes;
  if (defined(gltf.scenes) && defined(gltf.scene)) {
    nodes = gltf.scenes[gltf.scene].nodes;
  }
  nodes = defaultValue(nodes, gltf.nodes);
  nodes = defined(nodes) ? nodes : [];
  return nodes;
}

function loadFeatureMetadataBufferViews(loader, gltf, featureMetadata) {
  var bufferViewIds = {};

  var featureTables = featureMetadata.featureTables;
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

  var bufferViewCacheResources = {};

  var bufferViewPromises = [];
  for (var bufferViewId in bufferViewIds) {
    if (bufferViewIds.hasOwnProperty(bufferViewId)) {
      var bufferViewCacheResource = ResourceCache.loadBufferView({
        gltf: gltf,
        bufferViewId: bufferViewId,
        gltfResource: loader._gltfResource,
        baseResource: loader._baseResource,
        keepResident: false,
      });
      bufferViewCacheResources[bufferViewId] = bufferViewCacheResource;
      bufferViewPromises.push(bufferViewCacheResource.promise);
    }
  }

  var that = this;

  return when.all(bufferViewPromises).then(function () {
    var bufferViews = {};
    var bufferViewCacheResources = that._bufferViewCacheResources;
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


function parse(loader, model, gltf, supportedImageFormats) {
  var nodeIds = getSceneNodeIds(gltf);

  model.nodes = loadNodes(loader, gltf, nodeIds, supportedImageFormats);

  var extensions = defaultValue(gltf.extensions, defaultValue.EMPTY_OBJECT);
  var featureMetadataExtension = extensions.EXT_feature_metadata;
  if (defined(featureMetadataExtension)) {
    var featureMetadata = new MetadataGltfExtension({
      gltf: gltf,
      gltfResource: loader._gltfResource,
      baseResource: loader._baseResource,
      featureMetadata: featureMetadataExtension,
    });
    featureMetadata.load();
    model.featureMetadata = featureMetadata;
  }

  return model;
}

function unload(loader) {
  if (defined(loader._gltfCacheResource)) {
    ResourceCache.unload(loader._gltfCacheResource);
  }
  loader._gltfCacheResource = undefined;
}

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @returns {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see GltfLoader#destroy
 */
GltfLoader.prototype.isDestroyed = function () {
  return false;
};

/**
 * Unloads resources from the cache.
 * <br /><br />
 * Once an object is destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
 * assign the return value (<code>undefined</code>) to the object as done in the example.
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 * @example
 * handler = handler && handler.destroy();
 *
 * @see GltfLoader#isDestroyed
 */
GltfLoader.prototype.destroy = function () {
  unload(this);
  return destroyObject(this);
};
