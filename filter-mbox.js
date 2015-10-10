#!/usr/bin/env babel-node

import Moment from "moment";
import {MailParser} from "mailparser";
import mimelib from "mimelib";

import fs from "fs";
import readline from "readline";

function createReadStreamFromArgument(argument) {
	let stream;
	if (argument === "-") {
		stream = process.stdin;
	} else {
		stream = fs.createReadStream(argument);
	}

	stream.setEncoding("binary");

	return stream;
}

function printLine(line) {
	process.stdout.write(line, "binary");
	process.stdout.write("\n", "binary");
}

let previousSubject = null;
function processMbox(mboxPath, condition) {
	const readStream = createReadStreamFromArgument(mboxPath);

	const reader = readline.createInterface({
		input: readStream,
		terminal: false,
		historySize: 1
	});

	readStream.on("end", () => reader.close());

	let didEmailMatch = false;
	let previousDate = null;
	const matchHeaders = (fromLine, headers) => {
		const conditional = eval(condition);

		let parsedHeaders = mimelib.parseHeaders(headers.replace(/^Content-Type:/i, "X-Content-Type"));


		if (parsedHeaders.date) {
			parsedHeaders.date = MailParser.prototype._parseDateString(parsedHeaders.date[0]);
		}

		if (!parsedHeaders.date) {
			let possibleDate = fromLine.split(" ").slice(2).join(" ");
			parsedHeaders.date = MailParser.prototype._parseDateString(possibleDate);

			if (!parsedHeaders.date) {
				let errorMessage = parsedHeaders.subject ?
					`Email in ${mboxPath} had no recognized date with subject: ${parsedHeaders.subject}.` :
					(
						previousSubject ?
						`Email in ${mboxPath} with non-existent subject had no recognized date, previous email subject: ${previousSubject}.` :
						`Email in ${mboxPath} with non-existent subject had no recognized date and no previous subject was recorded.`
					);

				if (previousDate) errorMessage += `Date for this email will be: ${previousDate}`;

				process.stderr.write(`${errorMessage}\n`, "binary");
			}

			if (!parsedHeaders.date && previousDate) {
				parsedHeaders.date = previousDate;
			}
		}

		if (parsedHeaders.date) previousDate = parsedHeaders.date;

		didEmailMatch = conditional(mboxPath, parsedHeaders);
		if (didEmailMatch) {
			printLine(fromLine, "binary");
			process.stdout.write(headers, "binary");

			if (mboxPath !== "-" && headers.indexOf("\nX-Was-Archived-At:") === -1) {
				printLine("X-Was-Archived-At: " + mboxPath + "\n", "binary");
			}

			previousSubject = parsedHeaders.subject;
		}
	};

	let inProgressHeaders = "";
	let fromLine = "";
	let sawBlankline = true;
	let isReadingHeaders = true;
	reader.on("line", line => {
		if (line.indexOf("From ") === 0 && sawBlankline) {
			isReadingHeaders = true;
			inProgressHeaders = "";

			fromLine = line;
		} else if (isReadingHeaders) {
			if (line.length === 0) {
				isReadingHeaders = false;

				matchHeaders(fromLine, inProgressHeaders);
			} else {
				line = line + "\n";
				inProgressHeaders += line;
			}
		} else if (didEmailMatch) {
			printLine(line, "binary");
		}

		sawBlankline = line.length === 0;
	});
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
	const fromMoment = Moment(from, format).toDate();

	// Always add one day to the toMoment to allow the later less than comparison to succeed correctly.
	const toMoment = Moment(to, format).add(1, "day").toDate();

	return (mboxPath, email) => {
		return fromMoment <= email.date && email.date < toMoment;
	};
}

for (let mbox of (mboxes: Array)) {
	processMbox(mbox, condition);
}
