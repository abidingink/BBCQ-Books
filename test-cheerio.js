import * as cheerio from 'cheerio';

async function test() {
  const cleanIsbn = '9781979135191';
  const url = `https://www.bookfinder.com/isbn/${cleanIsbn}/?author=&binding=ANY&condition=ANY&currency=USD&destination=US&firstEdition=false&isbn=${cleanIsbn}&keywords=&language=EN&maxPrice=&minPrice=&noIsbn=false&noPrintOnDemand=false&publicationMaxYear=&publicationMinYear=&publisher=&bunchKey=&signed=false&title=&viewAll=false&mode=ADVANCED`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const title = $('meta[itemprop="name"]').attr('content');
  const author = $('meta[itemprop="author"]').attr('content');
  const cover_img = $('img[src*="pictures.abebooks.com"]').attr('src');
  
  let description = $('aside h2:contains("About the book")').next('div').text() || '';
  
  console.log({ title, author, cover_img, description });
}

test();
