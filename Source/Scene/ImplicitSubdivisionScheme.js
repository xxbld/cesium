import DeveloperError from "../Core/DeveloperError.js";

/**
 * The subdivision scheme for an implicit tileset.
 *
 * @enum {String}
 * @private
 */
var ImplicitSubdivisionScheme = {
  /**
   * A quadtree divides a parent tile into four children, split at the midpoint
   * of the x and y dimensions of the bounding box
   * @type {String}
   * @constant
   * @private
   */
  QUADTREE: "QUADTREE",
  /**
   * An octree divides a parent tile into four children, split at the midpoint
   * of the x, y, and z dimensions of the bounding box.
   * @type {String}
   * @constant
   * @private
   */
  OCTREE: "OCTREE",
};

/**
 * Get the branching factor for the given subdivision scheme
 * @param {ImplicitSubdivisionScheme} subdivisionScheme The subdivision scheme
 * @returns {Number} The branching factor, either 4 for QUADTREE or 8 for OCTREE
 * @private
 */
ImplicitSubdivisionScheme.getBranchingFactor = function (subdivisionScheme) {
  switch (subdivisionScheme) {
    case ImplicitSubdivisionScheme.OCTREE:
      return 8;
    case ImplicitSubdivisionScheme.QUADTREE:
      return 4;
    //>>includeStart('debug', pragmas.debug);
    default:
      throw new DeveloperError("subdivisionScheme is not a valid value.");
    //>>includeEnd('debug');
  }
};

export default Object.freeze(ImplicitSubdivisionScheme);
