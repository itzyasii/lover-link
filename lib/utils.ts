import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface MongoDBDate {
  $date: string;
}

type DateInput = string | Date | MongoDBDate | unknown;

export function formatTime(date: DateInput) {
  let validDate: Date;
  if (date instanceof Date) {
    validDate = date;
  } else if (typeof date === "string") {
    validDate = new Date(date);
  } else if (typeof date === "object" && date !== null) {
    // Handle MongoDB { $date: "..." } format
    if ("$date" in date && typeof (date as MongoDBDate).$date === "string") {
      validDate = new Date((date as MongoDBDate).$date);
    } else {
      validDate = new Date();
    }
  } else {
    validDate = new Date();
  }

  // Check if date is valid
  if (isNaN(validDate.getTime())) {
    validDate = new Date();
  }

  return validDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
