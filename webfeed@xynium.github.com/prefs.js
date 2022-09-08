/*
 * RSS Feed extension for GNOME Shell
 *
 * from (C) 2015
 *     Tomas Gazovic <gazovic.tomasgmail.com>,
 *     Janka Gazovicova <jana.gazovicova@gmail.com>
 *
 * mk2 by Xynium September 2022
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain('WebFeed');
const _ = Gettext.gettext;

const COLUMN_ID = 0;
const MAX_UPDATE_INTERVAL = 1440;

const RSS_FEEDS_LIST_KEY = 'rss-feeds-list';
const UPDATE_INTERVAL_KEY = 'update-interval';
const ITEMS_VISIBLE_KEY = 'items-visible';
const DELETE_AFTER = "delete-after"
const OKFORNOTIF ="okfornotif";
const DURHOTISHOT =  "durationhotitem";
const DLYFORRX ="delayforreceive";

const MyPrefsWidgetF = GObject.registerClass(
class MyPrefsWidgetF extends Gtk.Box {

    _init (params) {
        super._init(params);

        let builder = new Gtk.Builder();
        builder.set_translation_domain('WebFeed');
        builder.add_from_file(Me.path + '/prefs.ui');
        
        this.Settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.webfeed');

        // update interval
        let widjet0= builder.get_object("spbt1");
        widjet0.set_range(0, MAX_UPDATE_INTERVAL);
        this.Settings.bind(UPDATE_INTERVAL_KEY, widjet0, 'value', Gio.SettingsBindFlags.DEFAULT);
        
        // items visible per page
        let widjet1 = builder.get_object('spbt2');
        this.Settings.bind(ITEMS_VISIBLE_KEY, widjet1, 'value', Gio.SettingsBindFlags.DEFAULT);
        
         // delete after
        let widjet3 = builder.get_object('spbtn3');
        this.Settings.bind(DELETE_AFTER, widjet3, 'value', Gio.SettingsBindFlags.DEFAULT);
        
         // delais rx
        let widjet4 = builder.get_object('spbtnRxDly');
        this.Settings.bind(DLYFORRX, widjet4, 'value', Gio.SettingsBindFlags.DEFAULT);

        // delete news
        let widjet5 = builder.get_object('spindurhot');
        this.Settings.bind(DURHOTISHOT, widjet5, 'value', Gio.SettingsBindFlags.DEFAULT);

        // switch btn notif
        let widjet6 = builder.get_object('swNotif');
        this.Settings.bind(OKFORNOTIF, widjet6, 'active', Gio.SettingsBindFlags.DEFAULT);

        // rss feed sources
        this.feedstore = builder.get_object('liststore1');
        this.loadStoreFromSettings();

        this.widget2 = builder.get_object('trvFeed');
        //widjet2.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        let column = builder.get_object('treeviewcolumn1');
        
        let cell = new Gtk.CellRendererText({ editable: false });
        column.pack_start(cell, true);
        column.add_attribute(cell, "text", COLUMN_ID);
        this.widget2.append_column(column);

        let delButton =  builder.get_object('delButton');
        delButton.connect('clicked', ()=>{this.deleteSelected();});
        
        let editButton = builder.get_object('editButton');
        editButton.connect('clicked', ()=>{this.editSelected();});

        let newButton = builder.get_object('newButton');
        newButton.connect('clicked',()=>{this.createNew();});

        this.add( builder.get_object('prefs-container') );
  
    }

    /*
     *  Creates modal dialog when adding new or editing RSS source
     *  title - dialog title
     *  text - text in dialog
     *  onOkButton - callback on OK button clicked
     */
    createDialog(title, text, onOkButton) {
        let dialog = new Gtk.Dialog({title: title});
        dialog.set_modal(true);
        dialog.set_resizable(true);
        dialog.set_border_width(12);

        this._entry = new Gtk.Entry({text: text});
        //this._entry.margin_top = 12;
        this._entry.margin_bottom = 12;
        this._entry.width_chars = 80;

        this._entry.connect("changed", ()=> {

            if (this._entry.get_text().length === 0)
                this._okButton.sensitive = false;
            else
                this._okButton.sensitive = true;
        });

        dialog.add_button(Gtk.STOCK_CANCEL, 0);
        this._okButton = dialog.add_button(Gtk.STOCK_OK, 1);    // default
        this._okButton.set_always_show_image(true) ;
        dialog.set_default(this._okButton);
        this._entry.activates_default = true;

        let dialog_area = dialog.get_content_area();
        dialog_area.pack_start(this._entry, 0, 0, 0);

        dialog.connect("response", (w, response_id)=> {
            if (response_id) {  // button OK
                onOkButton();
            }
            dialog.hide();
        });
        dialog.show_all();
    }

    createNew() {
        this.createDialog(_("New Feed source"), '', () =>{
            if (this._entry.get_text()==''){
                return;
            }
            // update tree view
            let iter = this.feedstore.append();
            this.feedstore.set_value(iter, COLUMN_ID, this._entry.get_text());

            // update settings
            let feeds = this.Settings.get_strv(RSS_FEEDS_LIST_KEY);
            if (feeds == null)
                feeds = new Array();

            feeds.push(this._entry.get_text());
            this.Settings.set_strv(RSS_FEEDS_LIST_KEY, feeds);
            this.Settings.set_boolean("torefresh", true);  
            
        });
    }

    editSelected() {// update tree view
        let [any, model, iter] = this.widget2.get_selection().get_selected();

        if (any) {
            this.createDialog(_("Edit Feed source"), model.get_value(iter, COLUMN_ID),  () =>{
                if (this._entry.get_text()==''){
                     return;
                }
                this.feedstore.set_value(iter, COLUMN_ID, this._entry.get_text());

                // update settings
                let index = model.get_path(iter).get_indices();
                let feeds = this.Settings.get_strv(RSS_FEEDS_LIST_KEY);
                if (feeds == null)
                    feeds = new Array();

                if (index < feeds.length) {
                    feeds[index] = this._entry.get_text();
                    this.Settings.set_strv(RSS_FEEDS_LIST_KEY, feeds);
                }
                this.Settings.set_boolean("torefresh", true); 
            });
            
        }
    }
    
    deleteSelected() {
        let [any, model, iter] = this.widget2.get_selection().get_selected();
        if (any) {
            // must call before remove
            let index = model.get_path(iter).get_indices();
            // update tree view
            this.feedstore.remove(iter);

            // update settings
            let feeds = this.Settings.get_strv(RSS_FEEDS_LIST_KEY);
            if (feeds == null)
                feeds = new Array();

            if (index < feeds.length) {
                feeds.splice(index, 1);
                this.Settings.set_strv(RSS_FEEDS_LIST_KEY, feeds);
            }
        }
    }

    loadStoreFromSettings() {
        let feeds = this.Settings.get_strv(RSS_FEEDS_LIST_KEY);
        if (feeds) {
            for (let i = 0; i < feeds.length; i++) {
                if (feeds[i]) { // test on empty string
                    let iter = this.feedstore.append();
                    this.feedstore.set_value(iter, COLUMN_ID, feeds[i]);
                }
            }
        }
    }
});


function init() {
}


function buildPrefsWidget() {
    let widget = new MyPrefsWidgetF();
    widget.show_all();
    return widget;
}
