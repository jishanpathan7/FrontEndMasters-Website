const Course = require("../models/courses.model");
const redis = require("../config/redis");

const { StatusCodes } = require("http-status-codes");

const { INTERNAL_SERVER_ERROR, OK } = StatusCodes;

const getCoursesStatic = async (req, res) => {
	try {
		let courses = await redis.get("courses");
		if (courses) return res.status(OK).send(JSON.parse(courses));
		else {
			courses = await Course.find().lean().exec();
			if (courses.length !== 0) {
				await redis.set(`courses`, JSON.stringify(courses));
				return res.status(OK).send(courses);
			} else return res.status(OK).send(courses);
		}
	} catch (err) {
		console.log("Error", err);
		return res.status(INTERNAL_SERVER_ERROR).send({ err: err.messgage });
	}
};

const getCourses = async (req, res) => {
	try {
		const queryObject = {};
		const { courseName, author, popular } = req.query;
		let key = [];

		if (courseName) {
			queryObject.courseName = { $regex: courseName, $options: "i" };
			key.push(courseName);
		}

		let courses;
		// Author Query
		if (author) {
			courses = await redis.get(`courses.authors.${author}`);
			if (courses) {
				let parsedCourses = JSON.parse(courses);
				return res.status(OK).send({
					courses: parsedCourses,
					nbHits: parsedCourses.length,
					redis: true,
				});
			}

			courses = await Course.aggregate([
				{
					$lookup: {
						from: "authors",
						localField: "author",
						foreignField: "_id",
						as: "author",
					},
				},
				{
					$match: {
						"author.author": { $regex: author, $options: "i" },
					},
				},
			]).exec();
			await redis.set(`courses.authors.${author}`, JSON.stringify(courses));
			return res.status(OK).send({
				courses,
				nbHits: courses.length,
				redis: false,
			});
		}
		if (popular) {
			queryObject.popular = popular === "true" ? true : false;
			key.push(popular);
		}

		courses = await redis.get(`courses.${key.join(".")}`);
		if (courses) {
			let parsedCourses = JSON.parse(courses);
			return res.status(OK).send({
				courses: parsedCourses,
				courseCount: parsedCourses.length,
				redis: true,
			});
		}

		courses = await Course.find(queryObject).populate("author");
		if (courses.length !== 0)
			await redis.set(`courses.${key.join(".")}`, JSON.stringify(courses));

		return res
			.status(OK)
			.send({ courses, courseCount: courses.length, redis: false });
	} catch (err) {
		console.log("Error", err);
		return res.status(INTERNAL_SERVER_ERROR).send({ err: err.message });
	}
};

const createCourses = async (req, res) => {
	try {
		let course = req.body;
		let webpPath = req.files.webpImg[0].path;
		let previewPath = req.files.previewImage[0].path;

		course.webpImg = webpPath;
		course.previewImage = previewPath;
		course = await Course.create(course);

		await redis.set(`courses.${course._id}`, JSON.stringify(course));

		let allCourses = await redis.get("courses");
		if (allCourses) {
			let parsedCourses = JSON.parse(allCourses);
			allCourses = [...parsedCourses, course];
			await redis.set(`courses`, JSON.stringify(allCourses));
		} else {
			allCourses = await Course.find().lean().exec();
			await redis.set(`courses`, JSON.stringify(allCourses));
		}

		return res.status(OK).send(course);
	} catch (err) {
		console.log("Error", err);
		return res.status(INTERNAL_SERVER_ERROR).send({ err: err.message });
	}
};

module.exports = { getCoursesStatic, createCourses, getCourses };
