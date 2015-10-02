#!/usr/bin/env babel-node

import Mbox from "node-mbox";
import Moment from "moment";
import {MailParser} from "mailparser";

MailParser.prototype._convertString = value => value;

import fs from "fs";

function createReadStreamFromArgument(argument) {
	if (argument === "-") {
		return process.stdin;
	} else {
		return fs.createReadStream(argument);
	}
}

const headerBodySplitter = /\n\r*\n/;
function getHeaderAndBody(email) {
	const bodyStart = email.search(headerBodySplitter);

	return { headers: email.slice(0, bodyStart), body: bodyStart !== -1 ? email.slice(bodyStart) : "\n\n" };
}

function processMbox(mboxPath, condition) {
	let mbox = new Mbox();

	mbox.on("message", email => {
		const { headers, body } = getHeaderAndBody(email);
		const mailParser = new MailParser();

		mailParser.on("end", parsedEmail => {
			const conditional = eval(condition);

			if (conditional(parsedEmail)) {
				process.stdout.write(headers, "binary");

				if (mboxPath !== "-" && headers.indexOf("\nX-Was-Archived-At:") === -1) {
					process.stdout.write("\nX-Was-Archived-At: " + mboxPath, "binary");
				}

				process.stdout.write(body, "binary");
				process.stdout.write("\n", "binary");
			}
		});

		mailParser.write(headers);
		mailParser.end();
	});

	createReadStreamFromArgument(mboxPath).pipe(mbox);
}

function usage() {
	process.stderr.write("Improper usage.\n");
	process.stderr.write("Usage: filter-mbox.js <condition> [<mbox>|-]...\n");
	process.exit(1);
}

let args = process.argv.slice(2);

if (args.length < 2) usage();

let mboxes = args.slice(1);
let condition = args[0];

function date(from, to) { // eslint-disable-line no-unused-vars
	const format = "YYYY-MM-DD";
	const fromMoment = Moment(from, format);
	const toMoment = Moment(to, format);

	return email => {
		if (!email || !email.date) {
			process.stderr.write(`Email with ${
				email.subject ? "subject" : "non-existent subject"
			}${email.subject ? (` "` + email.subject + `"`) : ""} had no recognized date.\n`, "binary");
		}

		const emailDate = Moment(email.date);
		const isBetweenExclusive = emailDate.isBetween(fromMoment, toMoment);
		const isAtEdge = emailDate.isSame(fromMoment) || emailDate.isSame(toMoment);

		return isBetweenExclusive || isAtEdge; // Inclusive range
	};
}

for (let mbox of (mboxes: Array)) {
	processMbox(mbox, condition);
}
