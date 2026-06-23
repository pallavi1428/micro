import { Outsource } from "../models/outsource.model.js";
import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from "mongoose";

//CREATE OUTSOURCE
export const createOutsource = asyncHandler(async (req, res) => {
  const {
    title,//object destructuring to pull out all the descriptive details 
    // from the incoming request payload (req.body).
    description,
    paymentType,
    amount,
    rate,// stores them in local variables
//nstead of repeatedly writing: req.body.rate
    units,
    frequency,
    duration,
    hours,
    locationPreference,
    remote,
    skills,
    applicationDeadline,
  } = req.body;

  // Validation
  if (!title || !description) {
    throw new ApiError(400, "Title and description are required");
  }

  // Calculate total based on payment type (match your schema enum)
  let total = 0;
  if (paymentType === "one-time" && amount) {
    total = amount;
  } else if (paymentType === "per-unit" && rate && units) {
    total = rate * units;
  } else if (paymentType === "recurring" && rate && duration) {
    total = rate * duration;
  }
//Create a new MongoDB document outsource with these fields
  const outsource = await Outsource.create({
    title,
    description,
    paymentType,
    amount,
    rate,
    units,
    frequency,
    duration,
    hours,
    locationPreference,
    remote: remote !== undefined ? remote : true,
    skills: skills || [],
    applicationDeadline,
    createdBy: req.user._id, //Stores the ID of the currently logged-in user as the creator of this outsource posting.
    status: "active",
    total,
  });
//Returns the newly created outsource document back to the frontend 
// along with a success message.
  return res.status(201).json(
    new ApiResponse(201, { outsource }, "Outsource created successfully")
  );
});

//GET ALL OUTSOURCES (with pagination & filters) 
//calculate the database pagination boundaries
export const getAllOutsources = asyncHandler(async (req, res) => {
//req.originalUrl=url=/api/outsources?page=3&limit=10
//req.query=holding all the URL parameters={ page: "3", limit: "10" }
//req.query.page=value of the page parameter="3"
  const page = parseInt(req.query.page) || 1; //converting strings from req.query to numbers, defaulting to Page 1
  const limit = parseInt(req.query.limit) || 10; //10 items/per
  const skip = (page - 1) * limit;//formula of no. of rows to be skipped 1-1*10=0, 2-1*10=10
//$(3 - 1)10 =20, database skips first 20 items and returns the remaining 5 items (Items 21 to 25). if total 25 items
  const {
    status,
    paymentType,
    remote,//object destructuring to pull out all the descriptive details 
    // from the incoming request payload (req.body).
    minBudget,
    maxBudget,
    skill,
    search,
  } = req.query;

  // Build conditions array to avoid $or overwrites
  const conditions = [];

  // Base condition: only active outsources
  conditions.push({ isActive: true });

  // Deadline filter: include posts with no deadline OR future deadlines
  conditions.push({
    $or: [
      { applicationDeadline: null },
      { applicationDeadline: { $exists: false } },
      { applicationDeadline: { $gte: new Date() } }
    ]
  });

  // Apply status/payment/remote/budget/skill filter
  if (status) conditions.push({ status });
  if (paymentType) conditions.push({ paymentType });
  // Apply remote filter. Because remote is a boolean, we check if it is explicitly defined, 
  // then parse the string "true" into an actual JS boolean value (true/false)
  if (remote !== undefined) conditions.push({ remote: remote === "true" });
  if (remote !== undefined) conditions.push({ remote: remote === "true" });
  if (minBudget || maxBudget) {
    const budgetFilter = {};
    if (minBudget) budgetFilter.$gte = parseInt(minBudget); //gte is greater than or equal to, Converts query string to number.
    if (maxBudget) budgetFilter.$lte = parseInt(maxBudget);
    conditions.push({ total: budgetFilter }); // Inject the budget filters directly into the 'total' field condition
  }
  if (skill) {
   // $in means: Matches if the string variable 'skill' exists anywhere inside the document's array of 'skills'
    conditions.push({ skills: { $in: [skill] } });
  }
  
  // Search in title, description, and skills
  if (search) {
    conditions.push({
      $or: [
        { title: { $regex: search, $options: "i" } }, //$regex means: Pattern matching.
        { description: { $regex: search, $options: "i" } },
        { skills: { $regex: search, $options: "i" } }
      ]
    });
  }
// If we accumulated filter objects inside our conditions array, combine them all using a parent MongoDB $and operator. 
  // Otherwise, fallback to an empty object {} which returns all records.
  const filter = conditions.length > 0 ? { $and: conditions } : {};
//maximize application performance by utilizing Promise.all to execute our data query and document counter in parallel.
  const [outsources, totalOutsources] = await Promise.all([
    Outsource.find(filter)
//.populate acts like an SQL JOIN
//it instructs Mongoose to look into the Users collection, locate that creator's profile, 
// & substitute the raw ID string with a nested object containing their actual username, full name, avatar, and email.
      .populate("createdBy", "userName fullName avatar email")
      .sort({ createdAt: -1 }) //to show the newest jobs first
      .skip(skip) //slice the page
      .limit(limit)
      .lean(),
    Outsource.countDocuments(filter), // Counts total records matching filters globally (ignoring pagination limits)
  ]);
//calculate the total page count
  const totalPages = Math.max(1, Math.ceil(totalOutsources / limit));
//send a standardized ApiResponse packet back to the client.
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        outsources,
        pagination: {
          currentPage: page,
          totalPages,
          totalOutsources,
          limit,
          hasNextPage: page < totalPages, // True if there are more pages ahead
          hasPrevPage: page > 1, // True if the user has navigated past Page 1
        },
      },
      "Outsources fetched successfully"
    )
  );
});

//GET OUTSOURCE BY ID 
export const getOutsourceById = asyncHandler(async (req, res) => {
//req.params contain /:userId    api/users/64f1a23b 
//get the id from it
  const { outsourceId } = req.params;

  // Validate ObjectId structure before hitting MongoDB to avoid unexpected runtime query syntax crashes
  // Checks if the incoming ID string conforms to MongoDB's mandatory 24-character hex format
  if (!mongoose.Types.ObjectId.isValid(outsourceId)) {
    throw new ApiError(400, "Invalid outsource ID");
  }

  // Single query: increment views and get document
  const outsource = await Outsource.findByIdAndUpdate(
    outsourceId, //Target the specific record using its unique ID
    { $inc: { views: 1 } }, //Use $inc to boost the value of 'views' field by +1
    { new: true } //'true' returns the newly updated document data, false will return outdated data
  )
    .populate("createdBy", "userName fullName avatar email bio phoneNumber") //// First Populate: Resolves the 'createdBy' ObjectId relationship. 
    // Fetches profile details of the creator but explicitly selects only the specific fields
    .populate("applications")
    .lean(); //Convert raw document stream into a lightweight, clean JS object structure

  if (!outsource) {
    throw new ApiError(404, "Outsource not found");
  }

  return res.status(200).json(
    new ApiResponse(200, { outsource }, "Outsource fetched successfully") //Return a standardized 200 OK structural status response along with payload properties
  );
});

//GET USER'S OUTSOURCES
export const getUserOutsources = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  // Check if user exists
  const userExists = await User.exists({ _id: userId });
  if (!userExists) {
    throw new ApiError(404, "User not found");
  }

  const [outsources, totalOutsources] = await Promise.all([
    Outsource.find({ createdBy: userId })
      .populate("createdBy", "userName fullName avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Outsource.countDocuments({ createdBy: userId }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalOutsources / limit));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        outsources,
        pagination: {
          currentPage: page,
          totalPages,
          totalOutsources,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
      "User outsources fetched successfully"
    )
  );
});

//GET MY OUTSOURCES
export const getMyOutsources = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit; //Math formula to drop previous records

  const [outsources, totalOutsources] = await Promise.all([ //Run database lookups concurrently using Promise.all
    Outsource.find({ createdBy: req.user._id }) //Find all outsource documents where 'createdBy' matches the logged-in user's unique ID
//req.user._id is populated earlier in the request lifecycle by your authentication middleware (e.g., verifyJWT)
      .sort({ createdAt: -1 })  //desc order
      .skip(skip) //skip calculated no. of older rows
      .limit(limit) //caps array length
      .lean(),
    Outsource.countDocuments({ createdBy: req.user._id }), //Separately counts total documents matching this exact owner ID to calculate pagination limits
  ]);
//make sure to show 1 page even in 0 result
  const totalPages = Math.max(1, Math.ceil(totalOutsources / limit)); 

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        outsources,
        pagination: {
          currentPage: page,
          totalPages,
          totalOutsources,
          limit,
          hasNextPage: page < totalPages, //Evaluates to true if there are more pages left ahead
          hasPrevPage: page > 1, // Evaluates to true if user is on page 2 or higher
        },
      },
      "My outsources fetched successfully"
    )
  );
});

//UPDATE OUTSOURCE
export const updateOutsource = asyncHandler(async (req, res) => {
  const { outsourceId } = req.params;
  const {
    title,
    description,
    paymentType,
    amount,
    rate,
    units,
    frequency,
    duration,
    hours,
    locationPreference,
    remote,
    skills,
    applicationDeadline,
  } = req.body;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(outsourceId)) {
    throw new ApiError(400, "Invalid outsource ID");
  }

  // Single query: find and verify ownership in one operation
  const outsource = await Outsource.findOne({
    _id: outsourceId,
    createdBy: req.user._id, // Must match logged-in user ID from auth middleware
  });

  if (!outsource) {
    throw new ApiError(404, "Outsource not found or access denied");
  }

  // Whitelist of allowed fields for update (status intentionally excluded)
  const allowedUpdates = [
    "title", "description", "paymentType", "amount", "rate", "units",
    "frequency", "duration", "hours", "locationPreference", "remote",
    "skills", "applicationDeadline"
  ];
  
  const updateData = {}; //Loop through allowed fields to build a clean update packet object dynamically
  for (const field of allowedUpdates) {
    if (req.body[field] !== undefined) {  //// Check using !== undefined so that blank strings ("") or booleans (false) are preserved, skipping unprovided keys
      updateData[field] = req.body[field];
    }
  }

  // Recalculate total if relevant fields changed
  if (paymentType || amount !== undefined || rate !== undefined || units !== undefined || duration !== undefined) {
    const finalPaymentType = paymentType || outsource.paymentType;
    const finalAmount = amount !== undefined ? amount : outsource.amount;
    const finalRate = rate !== undefined ? rate : outsource.rate;
    const finalUnits = units !== undefined ? units : outsource.units;
    const finalDuration = duration !== undefined ? duration : outsource.duration;
    
    if (finalPaymentType === "one-time" && finalAmount) {
      updateData.total = finalAmount;
    } else if (finalPaymentType === "per-unit" && finalRate && finalUnits) {
      updateData.total = finalRate * finalUnits;
    } else if (finalPaymentType === "recurring" && finalRate && finalDuration) {
      updateData.total = finalRate * finalDuration;
    }
  }

  const updatedOutsource = await Outsource.findByIdAndUpdate(
    outsourceId,
    { $set: updateData },
    { new: true, runValidators: true }
  )
    .populate("createdBy", "userName fullName avatar")
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { outsource: updatedOutsource }, "Outsource updated successfully")
  );
});

//DELETE OUTSOURCE 
export const deleteOutsource = asyncHandler(async (req, res) => {
  const { outsourceId } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(outsourceId)) {
    throw new ApiError(400, "Invalid outsource ID");
  }

// Find the post, verify that the logged-in user owns it, and pull in applicant data
  // .populate("applications") replaces an array of application IDs with their actual object data
  const outsource = await Outsource.findOne({
    _id: outsourceId,
    createdBy: req.user._id,
  }).populate("applications");

  if (!outsource) {
    throw new ApiError(404, "Outsource not found or access denied");
  }

  // Soft delete if there are applications to preserve history
  if (outsource.applications && outsource.applications.length > 0) {
    outsource.isActive = false; // Flag it as false so global query filters automatically hide it from public lists
    outsource.status = "closed"; // Change state to closed so no more people can submit applications
    await outsource.save();
    return res.status(200).json(
      new ApiResponse(200, { outsource }, "Outsource closed due to existing applications")
    );
  }

  // Hard delete only if no applications exist
  await Outsource.findByIdAndDelete(outsourceId);

  return res.status(200).json(
    new ApiResponse(200, {}, "Outsource deleted successfully")
  );
});

//CLOSE OUTSOURCE 
export const closeOutsource = asyncHandler(async (req, res) => {
  const { outsourceId } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(outsourceId)) {
    throw new ApiError(400, "Invalid outsource ID");
  }

  // Find and verify ownership
  const outsource = await Outsource.findOne({
    _id: outsourceId,
    createdBy: req.user._id,
  });

  if (!outsource) {
    throw new ApiError(404, "Outsource not found or access denied");
  }

  const updatedOutsource = await outsource.closeOutsource();

  return res.status(200).json(
    new ApiResponse(200, { outsource: updatedOutsource }, "Outsource closed successfully")
  );
});

//GET OUTSOURCE STATS 
export const getOutsourceStats = asyncHandler(async (req, res) => {
  const totalOutsources = await Outsource.countDocuments(); //Count every single outsource post existing in the database collection
  const activeOutsources = await Outsource.countDocuments({ status: "active", isActive: true }); //ount only the posts that are currently live and actively open for applications
  const closedOutsources = await Outsource.countDocuments({ status: "closed" }); //Count posts that have been manually closed or automatically archived
  const totalViews = await Outsource.aggregate([
    { $group: { _id: null, total: { $sum: "$views" } } }, //$group: Collapses multiple documents into a single summary record
  ]); //don't split into categories; group absolutely everything together

  const outsourcesByPaymentType = await Outsource.aggregate([
    { $group: { _id: "$paymentType", count: { $sum: 1 } } }, 
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalOutsources,
        activeOutsources,
        closedOutsources,
        totalViews: totalViews[0]?.total || 0,
        outsourcesByPaymentType,
      },
      "Outsource stats fetched successfully"
    )
  );
});