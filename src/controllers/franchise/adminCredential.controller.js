import FranchiseAdmin from "../../models/Franchise/franchiseAdmin.model.js";
import Franchise from "../../models/Franchise/franchise.model.js";
import axios from "axios";
import bcrypt from "bcryptjs";
import { uploadToCloudinary } from "../../utils/cloudinaryUpload.js";
import { asyncHandler } from "../../utils/AsyncHandler.js";


export const createFranchiseAdmin = asyncHandler(async (req, res) => {

  const { accountId, name, email, password } = req.body;

  let profileImage = "";

  if (req.file) {

    const result = await uploadToCloudinary({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname
    });

    profileImage = result.secure_url;
  }

  const admin = await FranchiseAdmin.create({
    accountId,
    name,
    email,
    password,
    role: "FRANCHISE_ADMIN",
    status: "ACTIVE",
    profileImage
  });

  res.status(201).json({
    success: true,
    message: "FRANCHISE_ADMIN created successfully",
    data: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      status: admin.status,
      accountId: admin.accountId,
      profileImage: admin.profileImage,
      createdAt: admin.createdAt
    },
    meta: null
  });

});

export const getFranchiseAdmins = async (req, res) => {
  try {

    const { page = 1, limit = 10, search = "", accountId } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const query = {};

    // Franchise admin can only view admins from own franchise
    if (req.user?.role === "FRANCHISE_ADMIN") {
      if (!req.user.accountId) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
      query.accountId = req.user.accountId;
    } else if (accountId) {
      // Super admin / admin can filter by accountId
      query.accountId = accountId;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    const admins = await FranchiseAdmin.find(query)
      .select("-refreshToken")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const totalAdmins = await FranchiseAdmin.countDocuments(query);

    res.json({
      success: true,
      message: "Admins fetched successfully",
      data: admins,
      pagination: {
        total: totalAdmins,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalAdmins / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateFranchiseAdmin = async (req,res)=>{

 try{

 const { id } = req.params;
 const { name,password } = req.body;

 const updateData = {};

 if(name) updateData.name = name;

 if(password){
   updateData.password = await bcrypt.hash(password,10);
 }

 if(req.file){

   const result = await uploadToCloudinary({
     buffer:req.file.buffer,
     mimetype:req.file.mimetype,
     originalname:req.file.originalname
   });

   updateData.profileImage = result.secure_url;
 }

 const admin = await FranchiseAdmin.findByIdAndUpdate(
   id,
   updateData,
   {new:true}
 );

 res.json({
   success:true,
   message:"Admin updated",
   data:admin
 });

 }catch(error){

 res.status(500).json({
   success:false,
   message:error.message
 });

 }

};

export const deleteFranchiseAdmin = async (req,res)=>{

 const { id } = req.params;

 await FranchiseAdmin.findByIdAndDelete(id);

 res.json({
   success:true,
   message:"Admin deleted"
 });

};



export const franchiseAdminLogin = async (req,res)=>{

 try{

 const {email,password} = req.body;

 const admin = await FranchiseAdmin.findOne({email});

 if(!admin){
   return res.status(401).json({
     success:false,
     message:"Invalid email"
   });
 }

 const isMatch = await bcrypt.compare(password,admin.password);

 if(!isMatch){
   return res.status(401).json({
     success:false,
     message:"Invalid password"
   });
 }

 const token = jwt.sign(
   {
     adminId:admin._id,
     accountId:admin.accountId
   },
   process.env.JWT_SECRET,
   {expiresIn:"1d"}
 );

 res.json({
   success:true,
   message:"Login successful",
   token
 });

 }catch(error){

 res.status(500).json({
   success:false,
   message:error.message
 });

 }

};
