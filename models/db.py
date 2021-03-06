# -*- coding: utf-8 -*-
from datetime import datetime

if REQUIRE_HTTPS:
    request.requires_https()

## connect to db
db = DAL(DB_LOGIN, pool_size=1, check_reserved=['mysql', 'postgres'],
    driver_args=DB_ARGS, migrate=False)


## by default give a view/generic.extension to all actions from localhost
## none otherwise. a pattern can be 'controller/function.extension'
response.generic_patterns = ['*'] if request.is_local else [] # but note http://slides.com/amberdoctor/angularjs_and_web2py
## (optional) optimize handling of static files
response.optimize_css = 'concat,minify,inline'
response.optimize_js = 'concat,minify,inline'
## (optional) static assets folder versioning
response.static_version = '0.0.0'


# extra functions
def plural(num):
    if num == 1:
        return ''
    else:
        return 's'

def sanitize(q):
    return XML(q.replace('\n', '<br/>').\
          replace('    ', '&nbsp;&nbsp;&nbsp;&nbsp;'), sanitize=True)

def sanitize_JSON(q):
    try:
        if isinstance(q, dict):
            for i in q.keys():
                q[i] = sanitize_JSON(q[i])
        elif isinstance(q, list):
            for i in range(0, len(q)):
                q[i] = sanitize_JSON(q[i])
        elif isinstance(q, str):  # actual value
            q = str(sanitize(q))
    except:
        pass
    return q

def get_dates(date1, date2, type):
    s = ''
    if date1 and date1 < 0:
        date1 = str(0 - date1) + ' BC'
    if date2 and date2 < 0:
        date2 = str(0 - date2) + ' BC'
    if date1:
        if date2:
            # both dates
            if type == 'author':
                s = ' (' + str(date1) + ' - ' + str(date2) + ')'
            else:
                s = ' (Published in ' + str(date1) + ', written in ' + \
                    str(date2) + ')'
        else:
            # no date2
            if type == 'author':
                s = ' (b. ' + str(date1) + ')'
            else:
                s = ' (Published in ' + str(date1) + ')'
    elif date2:
        # no date1
        if type == 'author':
            s = ' (d. ' + str(date2) + ')'
        else:
            s = ' (Written in ' + str(date2) + ')'
    return s


from gluon.tools import Auth, Crud, Service, PluginManager, prettydate
auth = Auth(db)
crud, service, plugins = Crud(db), Service(), PluginManager()

auth.settings.extra_fields['auth_user'] = [
    Field('DateJoined', 'datetime', default=datetime.now(),
          readable=False, writable=False),
    Field('PrimaryLanguageID', 'integer', default=1),
    Field('UserBiography', 'text'),
    Field('IsDeleted', 'boolean', default=False, readable=False, writable=False)]

## create all tables needed by auth if not custom tables
auth.define_tables(username=True, signature=False)


# add signature to all tables (turn off cascade)
auth_signature = db.Table(db,'auth_signature',
	Field('created_on','datetime',default=request.now,
		writable=False,readable=False),
	Field('created_by',auth.settings.table_user,default=auth.user_id,
		writable=False,readable=False,ondelete='SET NULL'),
	Field('modified_on','datetime',update=request.now,default=request.now,
		writable=False,readable=False),
	Field('modified_by',auth.settings.table_user,
		default=auth.user_id,update=auth.user_id,
		writable=False,readable=False,ondelete='SET NULL'))


## configure email
mail = auth.settings.mailer
mail.settings.server = EMAIL_SERVER
mail.settings.sender = EMAIL_SENDER
mail.settings.login = EMAIL_LOGIN

## configure auth policy
auth.settings.registration_requires_verification = False
auth.settings.registration_requires_approval = False
auth.settings.reset_password_requires_verification = True

## if you need to use OpenID, Facebook, MySpace, Twitter, Linkedin, etc.
## register with janrain.com, write your domain:api_key in private/janrain.key
from gluon.contrib.login_methods.rpx_account import use_janrain
use_janrain(auth, filename='private/janrain.key')

#########################################################################
## Define your tables below (or better in another model file) for example
##
## >>> db.define_table('mytable',Field('myfield','string'))
##
## Fields can be 'string','text','password','integer','double','boolean'
##       'date','time','datetime','blob','upload', 'reference TABLENAME'
## There is an implicit 'id integer autoincrement' field
## Consult manual for more options, validators, etc.
##
## More API examples for controllers:
##
## >>> db.mytable.insert(myfield='value')
## >>> rows=db(db.mytable.myfield=='value').select(db.mytable.ALL)
## >>> for row in rows: print row.id, row.myfield
#########################################################################

###---------------------- LANGUAGE

# this is limited to admin
db.define_table('LANGUAGE',
			Field('LanguageCode', 'string', length=3, label='Two-letter code'),
			Field('EnglishName', 'string', length=64, label='English name'),
			Field('NativeName', 'string', length=64, required=True, label='Native name'))

db.LANGUAGE.LanguageCode.requires = IS_LENGTH(minsize=2, maxsize=3)
db.LANGUAGE.EnglishName.requires = IS_LENGTH(minsize=2, maxsize=64)
db.LANGUAGE.NativeName.requires = [IS_NOT_EMPTY(), IS_LENGTH(minsize=2, maxsize=64)]

# add reference in auth_user table
db.auth_user.PrimaryLanguageID.type = 'reference LANGUAGE'
db.auth_user.PrimaryLanguageID.requires = IS_IN_DB(db, db.LANGUAGE.id, '%(NativeName)s')


###---------------------- QUOTE

db.define_table('QUOTE',
            Field('Text', 'text', required=True),
            Field('QuoteLanguageID', 'reference LANGUAGE', required=True,
            		default=1, label='Language', ondelete='SET NULL'), # temporary default for testing purposes
            Field('IsOriginalLanguage', 'boolean', label='Quote is in original language'),
            Field('IsDeleted', 'boolean', default=False, readable=False, writable=False),
            Field('Note', 'text', label='Context or additional information'),
            auth_signature)

db.QUOTE.Text.requires = [IS_NOT_EMPTY(), IS_NOT_IN_DB(db, db.QUOTE.Text)]
db.QUOTE.QuoteLanguageID.requires = IS_IN_DB(db, db.LANGUAGE.id, '%(NativeName)s')
db.QUOTE.Note.requires = IS_LENGTH(maxsize=4096)
# we may want to decrease this max character size: currently allows >500 words


###---------------------- WORK

### note: it should not be possible to enter a WORK without joining it
### to a WORK_TR. same with authors

db.define_table('WORKTYPE',
            Field('TypeName', 'string', required=True),
            format='%(TypeName)s')

db.define_table('WORK',
            Field('YearPublished', 'integer', label='Year published'),
            Field('YearWritten', 'integer', label='Year written (if different)'),
            Field('Type', 'reference WORKTYPE', ondelete='SET NULL'),
            Field('IsHidden', 'boolean', default=False, readable=False,
              writable=False),
            auth_signature)

db.WORK.Type.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.WORKTYPE.id, '%(TypeName)s')]
db.WORK.YearPublished.requires = IS_INT_IN_RANGE(-5000,2050)
db.WORK.YearWritten.requires = IS_INT_IN_RANGE(-5000,2050)


###---------------------- WORK_TR

db.define_table('WORK_TR',
			Field('WorkID', 'reference WORK', required=True),
			Field('LanguageID', 'reference LANGUAGE', required=True,
					label='Language of this work or translation', ondelete='SET NULL'),
			Field('WorkName', 'string', length=1024, required=True,
					label='Name of work'),
			Field('WorkSubtitle', 'string', length=1024,
					label='Subtitle'),
			Field('WorkDescription', 'text',
					label='Description of work'),
			Field('WikipediaLink', 'string', length=256,
					label='Link to Wikipedia page'),
			Field('WorkNote', 'text',
					label='Context or additional information'),
      auth_signature)

db.WORK_TR.WorkID.requires = IS_IN_DB(db, db.WORK.id, '%(id)s (%(YearPublished)s)')
db.WORK_TR.LanguageID.requires = IS_IN_DB(db, db.LANGUAGE.id, '%(NativeName)s')
db.WORK_TR.WorkName.requires = [IS_NOT_EMPTY(), IS_LENGTH(maxsize=1024)]
db.WORK_TR.WorkSubtitle.requires = IS_LENGTH(maxsize=1024)
db.WORK_TR.WorkDescription.requires = IS_LENGTH(maxsize=4096)
db.WORK_TR.WikipediaLink.requires = \
		[IS_MATCH('^(https://|http://)?[a-z]{2}\.wikipedia\.org/wiki/.{1,}'),
		 IS_LENGTH(maxsize=256)]
db.WORK_TR.WorkNote.requires = IS_LENGTH(maxsize=4096)


###---------------------- AUTHOR

db.define_table('AUTHORTYPE',
            Field('TypeName', 'string', required=True),
            format='%(TypeName)s')

db.define_table('AUTHOR',
			Field('YearBorn', 'integer'),
			Field('YearDied', 'integer'),
            Field('Type', 'reference AUTHORTYPE', ondelete='SET NULL'),
			Field('IsHidden', 'boolean', default=False, readable=False,
        writable=False),
      auth_signature)

db.AUTHOR.Type.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.AUTHORTYPE.id, '%(TypeName)s')]
db.AUTHOR.YearBorn.requires = IS_INT_IN_RANGE(-5000,2050)
db.AUTHOR.YearDied.requires = IS_INT_IN_RANGE(-5000,2050)


###---------------------- AUTHOR_TR

db.define_table('AUTHOR_TR',
			Field('AuthorID', 'reference AUTHOR', required=True),
			Field('LanguageID', 'reference LANGUAGE', required=True,
					label='Your language', ondelete='SET NULL'),
			Field('FirstName', 'string', length=128,
					label='First name'),
			Field('MiddleName', 'string', length=128,
					label='Middle name'),
			Field('LastName', 'string', length=128,
					label='Last name'),
			Field('AKA', 'list:string',
					label='Other names'),
			Field('DisplayName', 'string', length=512, required=True,
					label='Default name'),
			Field('Biography', 'text'),
			Field('WikipediaLink', 'string', length=256,
					label='Link to Wikipedia page'),
      auth_signature)

db.AUTHOR_TR.AuthorID.requires = IS_IN_DB(
						db, db.AUTHOR.id, '%(id)s (%(YearBorn)s-%(YearDied)s)')
db.AUTHOR_TR.LanguageID.requires = IS_IN_DB(db, db.LANGUAGE.id, '%(NativeName)s')
db.AUTHOR_TR.FirstName.requires = IS_LENGTH(maxsize=128)
db.AUTHOR_TR.MiddleName.requires = IS_LENGTH(maxsize=128)
db.AUTHOR_TR.LastName.requires = IS_LENGTH(maxsize=128)
db.AUTHOR_TR.AKA.requires = IS_LIST_OF(IS_LENGTH(maxsize=256))
db.AUTHOR_TR.DisplayName.requires = [IS_NOT_EMPTY(), IS_LENGTH(maxsize=512)]
db.AUTHOR_TR.Biography.requires = IS_LENGTH(maxsize=8192)
db.AUTHOR_TR.WikipediaLink.requires = \
		[IS_MATCH('^(https://|http://)?[a-z]{2}\.wikipedia\.org/wiki/.{1,}'),
		 IS_LENGTH(maxsize=256)]


###---------------------- QUOTE_WORK

db.define_table('QUOTE_WORK',
			Field('QuoteID', 'reference QUOTE', required=True),
			Field('WorkID', 'reference WORK', required=True))

db.QUOTE_WORK.QuoteID.requires = IS_IN_DB(db, db.QUOTE.id, '%(Text)s')
db.QUOTE_WORK.WorkID.requires = IS_IN_DB(db, db.WORK.id, '%(id)s (%(YearPublished)s)')


###---------------------- WORK_AUTHOR

db.define_table('WORK_AUTHOR',
			Field('WorkID', 'reference WORK', required=True),
			Field('AuthorID', 'reference AUTHOR', required=True))

db.WORK_AUTHOR.AuthorID.requires = IS_IN_DB(db, db.AUTHOR.id,
									'%(id)s (%(YearBorn)s-%(YearDied)s)')
db.WORK_AUTHOR.WorkID.requires = IS_IN_DB(db, db.WORK.id, '%(id)s (%(YearPublished)s)')


###---------------------- TRANSLATION (fill out later)

db.define_table('TRANSLATION',
			Field('OriginalQuoteID', 'reference QUOTE'),
			Field('TranslatedQuoteID', 'reference QUOTE'),
			Field('TranslatorID', 'reference AUTHOR', ondelete='SET NULL'))


###---------------------- FLAG
# the below tables allow any quote, work, or author to be flagged. which ID field is active
# will be contextual. having them all in one table lets us see all flags at once and will
# help if a work if flagged as offensive when in fact the author name is offensive, etc.

db.define_table('FLAGTYPE',
            Field('FlagName', 'string', required=True),
            format='%(FlagName)s')

db.define_table('FLAG',
            Field('QuoteID', 'reference QUOTE'),  # this is not normal - suggestions?
            Field('AuthorID', 'reference AUTHOR_TR'),
            Field('WorkID', 'reference WORK_TR'),
            Field('Type', 'reference FLAGTYPE', required=True),
            Field('IsActive', 'boolean', default=True),
            Field('FlagNote', 'string'),
            auth_signature)

db.FLAG.Type.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.FLAGTYPE.id, '%(FlagName)s')]
db.FLAG.created_by.readable=True
db.FLAG.created_on.readable=True


###---------------------- RATING

db.define_table('RATING',
            Field('Rating', 'decimal(4,3)', required=True),
            Field('QuoteID', 'reference QUOTE', required=True),
            auth_signature)

db.RATING.Rating.requires = [IS_NOT_EMPTY(), IS_DECIMAL_IN_RANGE(0,5,dot=".")]
db.RATING.QuoteID.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.QUOTE.id, '%(Text)s')]
db.RATING.created_by.readable=True
db.RATING.created_on.readable=True
db.RATING.modified_by.readable=True
db.RATING.modified_on.readable=True


###---------------------- COMMENTS
db.define_table('COMMENT',
            Field('Text', 'text', required=True),
            Field('QuoteID', 'reference QUOTE', required=True),
            Field('Active', 'boolean', default=True, readable=False,
              writable=False),
            auth_signature)

db.COMMENT.Text.requires = IS_NOT_EMPTY()
db.COMMENT.QuoteID.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.QUOTE.id, '%(Text)s')]
db.RATING.created_by.readable=True
db.RATING.created_on.readable=True


###---------------------- ANTHOLOGIES
db.define_table('ANTHOLOGY',
            Field('Name', 'string', length=128, required=True),
            Field('Description', 'text'),
            Field('Active', 'boolean', default=True, readable=False,
                writable=False),
            auth_signature)

db.ANTHOLOGY.Name.requires = [IS_NOT_EMPTY(), IS_LENGTH(maxsize=128)]
db.ANTHOLOGY.Description.requires = IS_LENGTH(maxsize=8192)
db.ANTHOLOGY.created_by.readable=True
db.ANTHOLOGY.created_on.readable=True


db.define_table('SELECTION',
            Field('QuoteID', 'reference QUOTE', required=True),
            Field('AnthologyID', 'reference ANTHOLOGY', required=True),
            Field('AddedOn', 'datetime', default=request.now,
                writable=False, readable=True))

db.SELECTION.QuoteID.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.QUOTE.id, '%(Text)s')]
db.SELECTION.AnthologyID.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.ANTHOLOGY.id, '%(Name)s')]


db.define_table('FOLLOW_ANTHOLOGY',
            Field('AnthologyID', 'reference ANTHOLOGY', required=True),
            Field('UserID', auth.settings.table_user, default=auth.user_id,
        writable=False,readable=True),
            Field('AddedOn', 'datetime', default=request.now,
                writable=False, readable=True))

db.FOLLOW_ANTHOLOGY.AnthologyID.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.ANTHOLOGY.id, '%(Name)s')]
db.FOLLOW_ANTHOLOGY.UserID.requires = IS_NOT_EMPTY()

# upon user registration, create default anthology and follow it
def add_default_anthology(fields, id):
    fields.update(UserID=id)
    fields.update(created_by=id)
    fields.update(Name='Favorite Quotes')
    fields.update(Description='This anthology is automatically created to ' \
        'hold any quotes that strike you. Create anthologies to collect ' \
        'and remember quotes on particular themes or for your own ' \
        'reference.')
    anth_id = int(db.ANTHOLOGY.insert( **db.ANTHOLOGY._filter_fields(fields) ))
    fields.update(AnthologyID = anth_id)
    fields.update(UserID = id)
    db.FOLLOW_ANTHOLOGY.insert( **db.FOLLOW_ANTHOLOGY._filter_fields(fields) )


db.auth_user._after_insert.append(add_default_anthology)

# upon anthology creation, follow it
def follow_new_anthology(fields, id):
    if auth.user:
        fields.update(AnthologyID=id)
        fields.update(UserID=auth.user)
        follow_id = int(db.FOLLOW_ANTHOLOGY.insert( **db.FOLLOW_ANTHOLOGY._filter_fields(fields) ))

db.ANTHOLOGY._after_insert.append(follow_new_anthology)

###---------------------- CONNECTIONS

db.define_table('CONNECTION',
            Field('Quote1', 'reference QUOTE', required=True),
            Field('Quote2', 'reference QUOTE', required=True),
            Field('Summary', 'text'),
            Field('Strength', 'integer'),
            Field('Description', 'text'),
            auth_signature)

db.CONNECTION.Quote1.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.QUOTE.id, '%(Text)s')]
db.CONNECTION.Quote2.requires = [IS_NOT_EMPTY(), IS_IN_DB(db, db.QUOTE.id, '%(Text)s')]
db.CONNECTION.Summary.requires = IS_LENGTH(maxsize=128)
db.CONNECTION.Description.requires = IS_LENGTH(maxsize=8192)
db.CONNECTION.created_by.readable=True




## enable record versioning only on important tables
db.QUOTE._enable_record_versioning()
db.AUTHOR._enable_record_versioning()
db.AUTHOR_TR._enable_record_versioning()
db.WORK._enable_record_versioning()
db.WORK_TR._enable_record_versioning()
db.FLAG._enable_record_versioning()
db.COMMENT._enable_record_versioning()
db.ANTHOLOGY._enable_record_versioning()
