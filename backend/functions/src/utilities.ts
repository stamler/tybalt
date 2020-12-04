// make a string with serial & manufacturer that uniquely identifies a computer
exports.makeSlug = function (serial: string, mfg: string) {
  const sc = serial.replace(/\s|\/|,/g, "");
  const mc = mfg
    .toLowerCase()
    .replace(/\/|\.|,|inc|ltd/gi, "")
    .trim()
    .replace(/ /g, "_");
  if (sc.length >= 4 && mc.length >= 2) {
    return sc + "," + mc;
  } else {
    throw new Error(`serial ${sc} or manufacturer ${mc} too short`);
  }
};