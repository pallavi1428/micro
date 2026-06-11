import {createTransport} from 'nodemailer'

const sendMail = async({email, subject, html})=>{
    const trasnport = creatTransport({
        host: "smtp.gmail.com",
        port: 465,
        auth: {
            user: "",
            password: "",
        }
    });
    await trasnport.sendMail({
        from: "",
        to: email,
        subject,
        html,
    })
}