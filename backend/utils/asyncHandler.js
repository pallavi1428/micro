const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
    }
}


export { asyncHandler }




// const asyncHandler = () => {}
// const asyncHandler = (func) => () => {}
// const asyncHandler = (func) => async () => {}


// const asyncHandler = (fn) => async (req, res, next) => {
//     try {
//         await fn(req, res, next)
//     } catch (error) {
//         res.status(err.code || 500).json({
//             success: false,
//             message: err.message
//         })
//     }
// }

// const TryCatch = (handler) => {
//     return async(req,res,next)=> {
//         try{
//             await handler(req,res,next)
//         } catch(error){
//             res.status(500).json({
//                 ressage: error.message,
//             })
//         }
//     }
// }
// esper default TryCatch