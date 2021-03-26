import defaultValue from "../Core/defaultValue.js";
import defined from "../Core/defined.js";
import MetadataEntity from "./MetadataEntity.js";
import MetadataTextureProperty from "./MetadataTextureProperty.js";

/**
 * A metadata texture.
 *
 * @param {Object} [options] Object with the following properties:
 * @param {Object} [options.properties] A dictionary containing properties.
 * @param {MetadataClass} [options.class] The class that properties conform to.
 * @param {Object} [options.textures] An object mapping texture IDs to {@link Texture} objects.
 *
 * @alias MetadataTexture
 * @constructor
 *
 * @private
 */
function MetadataTexture(options) {
  options = defaultValue(options, defaultValue.EMPTY_OBJECT);

  var properties = {};
  if (defined(options.properties)) {
    for (var propertyId in options.properties) {
      if (options.properties.hasOwnProperty(propertyId)) {
        properties[propertyId] = new MetadataTextureProperty({
          property: options.properties[propertyId],
          classProperty: options.class.properties[propertyId],
          textures: options.textures,
        });
      }
    }
  }

  this._class = options.class;
  this._properties = properties;
}

Object.defineProperties(MetadataTexture.prototype, {
  /**
   * The class that properties conform to.
   *
   * @memberof MetadataTexture.prototype
   * @type {MetadataClass}
   * @readonly
   * @private
   */
  class: {
    get: function () {
      return this._class;
    },
  },

  /**
   * A dictionary containing properties.
   *
   * @memberof MetadataTexture.prototype
   * @type {Object.<String, MetadataTextureProperty>}
   * @readonly
   * @private
   */
  properties: {
    get: function () {
      return this._properties;
    },
  },
});

/**
 * Returns whether this property exists.
 *
 * @param {String} propertyId The case-sensitive ID of the property.
 * @returns {Boolean} Whether this property exists.
 */
MetadataTexture.prototype.hasProperty = function (propertyId) {
  return MetadataEntity.hasProperty(this, propertyId);
};

/**
 * Returns an array of property IDs.
 *
 * @param {String[]} [results] An array into which to store the results.
 * @returns {String[]} The property IDs.
 */
 MetadataTexture.prototype.getPropertyIds = function (results) {
  return MetadataEntity.getPropertyIds(this, results);
};

export default MetadataTexture;
