export const test = (event: any, context: any, done: Function) => {
  console.log("test");
  done(null, "test");
};
