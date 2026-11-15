let promesa = new Promise((resolve, reject) => {

    setTimeout(() => {
   

    let condition = true; // Change this to false to test the reject case

    if (condition) {
        resolve("Promise resolved successfully!");
    }
    else {
        reject("Promise rejected!");
    }
    }, 1000);

});

promesa.then((message) => {
    console.log(message);
}).catch((error) => {
    console.error(error);
}).finally(() => {
    console.log("Promise has been settled (either resolved or rejected).");
});

console.log("This message is logged before the promise settles.");

