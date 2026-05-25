const msg = '🐷，你好';

async function main() { 
    while (true) {
        console.log(msg);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

main();