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
	const matchHeaders = (fromLine, headers) => {
		const conditional = eval(condition);

		let parsedHeaders = mimelib.parseHeaders(headers);
		if (parsedHeaders.date) {
			parsedHeaders.date = MailParser.prototype._parseDateString(parsedHeaders.date[0]);
		}

		if (!parsedHeaders.date) {
			const possibleDate = fromLine.split(" ").slice(2).join(" ");
			parsedHeaders.date = MailParser.prototype._parseDateString(possibleDate);
		}

		didEmailMatch = conditional(parsedHeaders);
		if (didEmailMatch) {
			printLine(fromLine, "binary");
			printLine(headers, "binary");

			if (mboxPath !== "-" && headers.indexOf("\nX-Was-Archived-At:") === -1) {
				printLine("X-Was-Archived-At: " + mboxPath, "binary");
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
	const fromMoment = Moment(from, format);
	const toMoment = Moment(to, format);

	return email => {
		if (!email || !email.date) {
			let errorMessage = email.subject ?
				`Email had no recognized date with subject: ${email.subject}.` :
				(
					previousSubject ?
					`Email with non-existent subject had no recognized date, previous email subject: ${previousSubject}` :
					`Email with non-existent subject had no recognized date and no previous subject was recorded.`
				);

			process.stderr.write(`${errorMessage}\n`, "binary");

			return false;
		} else {
			const emailDate = Moment(email.date);
			const isBetweenExclusive = emailDate.isBetween(fromMoment, toMoment);
			const isAtEdge = emailDate.isSame(fromMoment) || emailDate.isSame(toMoment);

			return isBetweenExclusive || isAtEdge; // Inclusive range
		}
	};
}

for (let mbox of (mboxes: Array)) {
	processMbox(mbox, condition);
}
