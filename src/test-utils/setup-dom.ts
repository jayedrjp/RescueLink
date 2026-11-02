// jsdom does not implement window.scrollTo (the router calls it on navigation).
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}
