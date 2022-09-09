/*
 * Xynium 2022
 * Parse Atom
 */


var AtomParser=class AtomParser  {
    constructor(xmlBase){
        this.Items =[];
        this.Title ='';
        this.HttpLink= '';
        this.Description= '';
        this.PublishDate= '';
        //this.n=0;
        this.parse(xmlBase);
    }

    parse(xml){
        for (let i = 0; i < xml.childElements.length; i++) {
            if (xml.childElements[i].name == 'title') {
                this.Title = xml.childElements[i].text;
            }
            else if (xml.childElements[i].name == 'link'&& xml.childElements[i].attribute('rel') != 'self')  {
                this.HttpLink = xml.childElements[i].attribute('href');
            }
            else if (xml.childElements[i].name == 'description') {
               this.Description = xml.childElements[i].text;
            }
            else if (xml.childElements[i].name == 'updated') {
                 this.PublishDate = xml.childElements[i].text;
            }
            else if (xml.childElements[i].name == 'entry') {
                this.parseItem(xml.childElements[i].childElements);
            }
        }
    }
    
    parseItem(itemElements) {
        //this.n++;

        var item =new class{
            constructor(){
            var Title= '',
            HttpLink= '',
            Description= '',
            Author= '',
            Contributor= '',
            PublishDate= ''
        }};

        for (let i = 0; i < itemElements.length; i++) {

            if (itemElements[i].name == 'title') {
                item.Title = itemElements[i].text;
                //log('At item'+this.n+'  Title  '+item.Title);
            }
            else if (itemElements[i].name == 'link') {
                item.HttpLink = itemElements[i].attribute('href');
                 //log('AT item'+this.n+'  Http  '+item.HttpLink);
            }
            else if (itemElements[i].name == 'description') {
                item.Description = itemElements[i].text;
                //log('AT item'+this.n+'  Desc  '+item.Description);
            }
            else if (itemElements[i].name == 'updated') {
                item.PublishDate = itemElements[i].text;
                 //log('AT item'+this.n+'  Date  '+item.PublishDate);
            }
            else if (itemElements[i].name == 'author') {
                item.Author = itemElements[i].text;
                // log('AT item'+this.n+'  Author  '+item.Author);
            }
        }
        this.Items.push(item);
    }
}

