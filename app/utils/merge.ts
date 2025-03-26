export function merge(target: any, source: any) {
  Object.keys(source).forEach(function (key) {
    
    const isObject = source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key]); // 明确排除数组
    if (source.hasOwnProperty(key) && isObject) { // 只对真正的对象进行递归
      if (
        source.hasOwnProperty(key) && // Check if the property is not inherited
        source[key] &&
        typeof source[key] === "object" || key === "__proto__" || key === "constructor"
      ) {
        merge((target[key] = target[key] || {}), source[key]);
        return;
      }
    }
    else if (source.hasOwnProperty(key)) { // 数组和其他类型会走这里
     target[key] = source[key]; // 直接覆盖
      }
  });
} 
