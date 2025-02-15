const express = require("express");
const { NotFound, BadRequest } = require("http-errors");
const path = require("path");
const fs = require("fs/promises");
const Jimp = require("jimp");
const { User } = require("../../models");
const { authenticate, upload } = require("../../middlewares");
const { sendEmail } = require("../../helpers");

const { SITE_NAME } = process.env;
const router = express.Router();

const avatarsDir = path.join(__dirname, "../../", "public", "avatars");

router.get("/logout", authenticate, async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: null });
  res.status(204).send();
});

router.get("/current", authenticate, async (req, res) => {
  const { name, email } = req.user;
  res.json({
    user: { name, email },
  });
});

router.patch(
  "/avatars",
  authenticate,
  upload.single("avatar"),
  async (req, res) => {
    const { path: tempUpload, filename } = req.file;
    [extension] = filename.split(".").reverse();
    const newFileName = `${req.user._id}.${extension}`;
    const fileUpload = path.join(avatarsDir, filename);
    await fs.rename(tempUpload, fileUpload);
    const avatarURL = path.join("avatars", newFileName);
    try {
      const avatarResize = await Jimp.read(fileUpload);
      avatarResize.resize(250, 250);
      avatarResize.write(fileUpload);
    } catch (error) {
      console.log(error);
      throw new Error("Error size avatar");
    }
    await User.findByIdAndUpdate(req.user._id, { avatarURL }, { new: true });
    res.json({ avatarURL });
  }
);

router.post("/verify", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      throw new BadRequest("missing required field email");
    }
    const user = await User.findOne({ email });
    if (!user) {
      throw new NotFound("User not found");
    }
    if (user.verify) {
      throw new BadRequest("Verification has already been passed");
    }
    const { verificationToken } = user;
    const data = {
      to: email,
      subject: "Подтверждение email",
      html: `<a target="blank" href="${SITE_NAME}/users/verify/${verificationToken}>Подтвердите email</a>`,
    };
    await sendEmail(data);
    res.json({ message: "Verification email sent" });
  } catch (error) {
    next(error);
  }
});

router.get("/verify/:verificationToken", async (req, res, next) => {
  try {
    const { verificationToken } = req.params;
    const user = await User.findOne({ verificationToken });
    if (!user) {
      throw new NotFound("User not found");
    }
    await User.findByIdAndUpdate(user._id, {
      verificationToken: null,
      verify: true,
    });
    res.json({ message: "Verification successful" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
