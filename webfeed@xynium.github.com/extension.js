/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2015
 *     Tomas Gazovic <gazovic.tomasgmail.com>,
 *     Janka Gazovicova <jana.gazovicova@gmail.com>
 *
 * This file is part of gnome-shell-extension-rss-feed.
 *
 * gnome-shell-extension-rss-feed is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * gnome-shell-extension-rss-feed is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-extension-rss-feed.  If not, see <http://www.gnu.org/licenses/>.
 */


const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;
const St = imports.gi.St;
const Util = imports.misc.util;
const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const JsxmL = Me.imports.jsxml;
const Rss = Me.imports.rss;
const Atom = Me.imports.atom;

const Gettext = imports.gettext.domain('webfeed');
const _ = Gettext.gettext;

const RSS_FEEDS_LIST_KEY = 'rss-feeds-list';
const UPDATE_INTERVAL_KEY = 'update-interval';
const ITEMS_VISIBLE_KEY = 'items-visible';
const DELETE_AFTER = "delete-after"
const _MS_PER_HOUR = 1000 * 60 * 60 ;


let rssFeedBtn;
let settings;

/*
 *  Main RSS Feed extension class
 */
 
const RssFeedButton  = GObject.registerClass(
class RssFeedButton extends PanelMenu.Button {
    
    
    _init() {
        super._init(0);

        this._httpSession = null;
        this._startIndex = 0;

        let topBox = new St.BoxLayout();
        // top panel button
        let icon = new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path()+ '/rss_green.png' ),
            style_class: 'webfeed-icon-size'
            
        });
        
        // 'application-rss+xml-symbolic',
        topBox.add_actor(icon)
        this.add_actor(topBox);
        
        //Menu
        this._feedsBox = new St.BoxLayout({
            vertical: true,
            reactive: false
        });

        this.feedsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.feedsSection);
        
        //lign time
        this.TimeMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let customTimeBox = new St.BoxLayout({
            style_class: 'webfeed-time-box ',
            vertical: false,
            clip_to_allocation: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
            x_expand: true,
            pack_start: false
        });
        
        this.lastUpdateTime = new St.Button({label: _("Last update")+': --:--'});
        customTimeBox.add_actor(this.lastUpdateTime);
        this.TimeMenu.add_actor(customTimeBox);
        this.menu.addMenuItem(this.TimeMenu);
        
        
        
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator);

        // buttons in bottom menu bar
        this._buttonMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let customButtonBox = new St.BoxLayout({
            style_class: 'webfeed-button-box ',
            vertical: false,
            clip_to_allocation: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            //x_expand: true,
            pack_start: false
        });
        
        let prevBtn = this.createRoundButton('go-previous');
        prevBtn.connect('clicked', () => {
            this.onPreviousBtnClicked();
        });
        customButtonBox.add_actor(prevBtn);
        

        let nextBtn = this.createRoundButton('go-next'); 
        nextBtn.connect('clicked', () => {
            this.onNextBtnClicked();
        });
        customButtonBox.add_actor(nextBtn);
        
         let reloadBtn = this.createRoundButton('view-refresh'); 
        reloadBtn.connect('clicked', () => {
            this.realoadRssFeeds();
        });
        customButtonBox.add_actor(reloadBtn);
     
        let settingsBtn = this.createRoundButton('emblem-system'); 
        settingsBtn.connect('clicked', () => {
            ExtensionUtils.openPrefs(); 
        });
        customButtonBox.add_actor(settingsBtn);
        
        this._buttonMenu.add_actor(customButtonBox);
        this.menu.addMenuItem(this._buttonMenu);
        
        try {
            // try to get default browser
            this._browser = Gio.app_info_get_default_for_uri_scheme("http").get_executable();
        }
        catch (err) {
            log(err + ' (get default browser error)');
            //return;
        }
        // loading data on startup
        this.lastUpdateTime.set_label(_("Last update")+': ' + new Date().toLocaleTimeString());
        this.realoadRssFeeds();
    }
    
    createRoundButton(iconName) {
        let button = new St.Button();
        button.child = new St.Icon({
            icon_name: iconName,
            style_class: 'webfeed-button-action' 
        });
        return button;
    }

    //  Frees resources of extension
    stop() {
        log('stopping webfeed');
        if (this._httpSession)
            this._httpSession.abort();
        this._httpSession = null;
        if (this._timeout)
            Mainloop.source_remove(this._timeout);
    }

    // previous button clicked callback
    onPreviousBtnClicked(){
        this._startIndex -= settings.get_int(ITEMS_VISIBLE_KEY);
        if (this._startIndex < 0)
            this._startIndex = 0
        this.refreshMenuLst();
    }
    
    //  On next button clicked callback
    onNextBtnClicked (){
        if (this._startIndex + settings.get_int(ITEMS_VISIBLE_KEY) < settings.get_strv(RSS_FEEDS_LIST_KEY).length)
        {
            this._startIndex += settings.get_int(ITEMS_VISIBLE_KEY);
            this._refreshExtensionUI();
        }
    }

    /*
     *  Returns JSON object that represents HTTP (GET method) parameters
     *  stored in URL
     *  url - HTTP request URL
     */
    getParametersAsJson(url) {
        if (url.indexOf('?') == -1)
            return "{}";

        let urlParams = url.substr(url.indexOf('?') + 1);
        let params = urlParams.split('&');

        let jsonObj = "{";
        for (let i = 0; i < params.length; i++)
        {
            let pair = params[i].split('=');
            jsonObj += '"' + pair[0] + '":' + '"' + pair[1] + '"';
            if (i != params.length -1)
                jsonObj += ',';
        }
        jsonObj += "}";

        return jsonObj;
    }

    //reload of RSS feeds from sources set in settings
    realoadRssFeeds() {
        log("Reload RSS Feeds");
                
        if (settings.get_strv(RSS_FEEDS_LIST_KEY).length==0) return;
        
        this.feedsArray = new Array(settings.get_strv(RSS_FEEDS_LIST_KEY).length);

        if (this._timeout)
            Mainloop.source_remove(this._timeout);

        if (settings.get_strv(RSS_FEEDS_LIST_KEY)) {

            for (let i = 0; i < settings.get_strv(RSS_FEEDS_LIST_KEY).length; i++)
            {
                let url = settings.get_strv(RSS_FEEDS_LIST_KEY)[i];
                let jsonObj = this.getParametersAsJson(url);

                if (url.indexOf('?') != -1)
                    url = url.substr(0, url.indexOf('?'));

                this.httpGetRequestAsync(url, JSON.parse(jsonObj), i);
            }
        }

        // set timeout if enabled
        if (settings.get_int(UPDATE_INTERVAL_KEY) > 0) {
            log("Next scheduled reload after " + settings.get_int(UPDATE_INTERVAL_KEY)*60 + " seconds");
            this._timeout = Mainloop.timeout_add(settings.get_int(UPDATE_INTERVAL_KEY)*60, this.realoadRssFeeds );
        }
    }

    /*
     *  Creates asynchronous HTTP GET request 
     *  url - HTTP request URL without parameters
     *  params - JSON object of HTTP GET request parameters
     *  position - Position in RSS sources list
     */
    httpGetRequestAsync(url, params, position) {
       
        if (this._httpSession == null) this._httpSession = new Soup.SessionAsync();
            
        //log("[" + position + "] Soup HTTP GET request. URL: " + url + " parameters: " + JSON.stringify(params));

        Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ProxyResolverDefault());
        let request = Soup.form_request_new_from_hash('GET', url, params);
        if (request==null) return;
       
        this._httpSession.queue_message(request, (_httpSession, message)=> {
            // log("[" + position + "] Soup HTTP GET reponse. Status code: " + message.status_code + " Content Type: " + message.response_headers.get_one("Content-Type"));
            if (message.response_body.data) this.onDownload(message.response_body.data, position);
        },);
    }

    /*
     *  On HTTP request response download 
     *  responseData - response data
     *  position - Position in RSS sources list
     */
    onDownload(responseData, position) {
        let xmlDoc = new JsxmL.REXML(responseData);
        let feedParser;
              
        if (xmlDoc.rootElement.name.toLowerCase().slice(0, 3) == 'rss'){  // 3 est la length de rss
            //log('RSS ');
            feedParser= new Rss.RssParser(xmlDoc.rootElement);
        }  
        
        if (xmlDoc.rootElement.name.toLowerCase().slice(0, 4) == 'feed'){
            //log('ATOM');
            feedParser= new Atom.AtomParser(xmlDoc.rootElement);
        }
        
        if (feedParser==null) {           // entré ni rss ni atom
            log('Bad XML'); 
            return; 
        }       

        //log('nItem '+feedParser.Items.length ); 
        
        if (feedParser.Items.length > 0)
        {
            let Feed = new class{
                   constructor(){
                    this.Title= feedParser.Title; 
                    this.HttpLink=  feedParser.HttpLink;
                    this.PublishDate=feedParser.PublishDate;
                    this.Items= [];
                } };
           // Feed.Title = feedParser.Title;
           
            for (let i = 0; i < feedParser.Items.length; i++) {
                let item = new class{
                   constructor(){
                     this.Title= feedParser.Items[i].Title;
                     this.HttpLink=  feedParser.Items[i].HttpLink;
                     this.PublishDate=feedParser.Items[i].PublishDate;
                }};
                //item.Title = feedParser.Items[i+1].Title;
                //item.HttpLink = feedParser.Items[i].HttpLink;
                Feed.Items.push(item);
            }
            this.feedsArray[position] = Feed;
        } 
        else{
            log('Bad XML no item'); 
            return; 
        }   
       
        this.refreshMenuLst();
        // update last download time
        this.lastUpdateTime.set_label(_("Last update")+': ' + new Date().toLocaleTimeString());
    }

    /*
     *  Reloads feeds section
     */
    refreshMenuLst() {
        let counter = 0;
        this.feedsSection.removeAll();
        this.EraseHotItem();
        
        for (let i = this._startIndex; i < this.feedsArray.length; i++) {
            if (this.feedsArray[i] && this.feedsArray[i].Items) {
                //if (this.feedsArray[i]==null) continue; //securité
                let old=((new Date()- this.ISODateParser(this.feedsArray[i].PublishDate)) / _MS_PER_HOUR); 
                if (old>settings.get_int(DELETE_AFTER)) continue;
                if (old<2*settings.get_int(UPDATE_INTERVAL_KEY))  this.hotItem(this.feedsArray[i].Title);
                let nItems = this.feedsArray[i].Items.length;
                let subMenu = new PopupMenu.PopupSubMenuMenuItem("("+old.toFixed(1)+"H ago) "+this.feedsArray[i].Title+ ' (' + nItems + ') :') ; //(Encoder.htmlDecode(title) + ' (' + nitems + ')');
                for (let j = 0; j < nItems; j++) {
                    old=((new Date()- this.ISODateParser(this.feedsArray[i].Items[j].PublishDate)) / _MS_PER_HOUR); 
                    if (old>settings.get_int(DELETE_AFTER)) continue;
                    if (old<2*settings.get_int(UPDATE_INTERVAL_KEY))  this.hotItem(this.feedsArray[i].Items[j].Title);
                    let menuItem = new PopupMenu.PopupMenuItem( "("+old.toFixed(1)+"H ago) "+this.feedsArray[i].Items[j].Title);  //(Encoder.htmlDecode(title) + ' (' + nitems + ')');
                    subMenu.menu.addMenuItem(menuItem);
                    //subMenu.menu.addAction( ("("+old.toFixed(1)+"H ago) "+this.feedsArray[i].Items[j].Title), null, 'view-refresh-symbolic'); 
                    menuItem.connect('activate', ()=>{
                           log("Opening browser with link " +  this.feedsArray[i].Items[j].HttpLink);
                           Util.trySpawnCommandLine(this._browser + ' ' + this.feedsArray[i].Items[j].HttpLink);
				     });
                }
                this.feedsSection.addMenuItem(subMenu);   
            }
            else {

                let subMenu = new PopupMenu.PopupMenuItem(_("No data available"));
                this.feedsSection.addMenuItem(subMenu);
            }
            counter++;
            if (counter == settings.get_int(ITEMS_VISIBLE_KEY))
                break;
        }
    }

    ISODateParser (datestr) {
        return new Date(datestr);
    }
    
    //notif new item
    hotItem(strItm){
        this.icon = new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path()+ '/rss_red.png' ),
            style_class: 'webfeed-icon-size'
            
        });
        //this.add_actor(icon);
    }
    
    EraseHotItem(){
        this.icon = new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path()+ '/rss_green.png' ),
            style_class: 'webfeed-icon-size'
            
        });
        //this.add_actor(icon);
    }
});

/*
 *  Extension widget instance
 */


/*
 *  Initialize the extension
 */
function init() {
    ExtensionUtils.initTranslations('webfeed');

    log("Extension initialized.");
}

/*
 *  Enable the extension
 */
function enable() {
    settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.webfeed');  
    rssFeedBtn = new RssFeedButton();
    Main.panel.addToStatusArea('WebFeedMenu', rssFeedBtn, 0, 'right');
    log("Extension enabled.");
}

/*
 *  Disable the extension
 */
function disable() {

    rssFeedBtn.stop();
    rssFeedBtn.destroy();
    rssFeedBtn=null;
    settings=null;
    log("Extension disabled.");
}
