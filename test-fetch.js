import https from 'https';

https.get('https://www.bookfinder.com/isbn/9781979135191/?author=&binding=ANY&condition=ANY&currency=USD&destination=US&firstEdition=false&isbn=9781979135191&keywords=&language=EN&maxPrice=&minPrice=&noIsbn=false&noPrintOnDemand=false&publicationMaxYear=&publicationMinYear=&publisher=&bunchKey=&signed=false&title=&viewAll=false&mode=ADVANCED', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(data);
  });
}).on('error', (err) => {
  console.log('Error: ' + err.message);
});
